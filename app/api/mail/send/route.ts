// app/api/mail/send/route.ts
// Send a new message, reply or forward from the signed-in member's mailbox.
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import MailMessage from "@/lib/models/MailMessage";
import logger from "@/lib/logger";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { bareAddress, isEmailAddress, mailDomain } from "@/lib/mail/address";
import { releaseMemberSends, reserveMemberSends } from "@/lib/mail/budget";
import { sendEmail } from "@/lib/mail/resend";
import { sanitizeComposedHtml, snippetOf, textToHtml } from "@/lib/mail/content";
import { presignMailGet, safeFilename } from "@/lib/mail/storage";
import { resolveThreadId } from "@/lib/mail/threading";
import { toListItem } from "@/lib/mail/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function addressList(value: any): string[] {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,;]/);
  return Array.from(new Set(list.map((v: any) => bareAddress(String(v))).filter(Boolean)));
}

export async function POST(req: NextRequest) {
  try {
    const { member, account } = await requireMailbox();
    const body = await req.json().catch(() => ({}));

    const to = addressList(body.to);
    const cc = addressList(body.cc);
    const bcc = addressList(body.bcc);
    const all = [...to, ...cc, ...bcc];
    if (!to.length) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
    const invalid = all.filter((a) => !isEmailAddress(a));
    if (invalid.length) return NextResponse.json({ error: `Not a valid address: ${invalid[0]}` }, { status: 400 });
    if (all.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Send to ${MAX_RECIPIENTS} people or fewer.` }, { status: 400 });
    }

    const subject = String(body.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    const text = String(body.text || "").slice(0, 200_000);
    if (!subject && !text.trim()) return NextResponse.json({ error: "Write a subject or a message." }, { status: 400 });

    // Attachments: fresh uploads must be under this mailbox's own prefix, and
    // forwarded ones must come from a message in this mailbox.
    const ownPrefix = `mail/out/${account._id}/`;
    const uploads: any[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 20) : [];
    const attachments: any[] = [];
    for (const u of uploads) {
      const key = String(u?.key || "");
      if (!key.startsWith(ownPrefix) || key.includes("..")) {
        return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
      }
      attachments.push({
        filename: safeFilename(u.filename),
        contentType: String(u.contentType || "application/octet-stream").slice(0, 100),
        size: Number(u.size) || 0,
        storageKey: key,
        state: "ready",
      });
    }

    let parent: any = null;
    if (body.replyToId && isObjectId(body.replyToId)) {
      parent = await MailMessage.findOne({ _id: body.replyToId, accountId: account._id }).lean<any>();
      if (!parent) return NextResponse.json({ error: "Original message not found." }, { status: 404 });
    }
    if (body.forwardOfId && isObjectId(body.forwardOfId)) {
      const original = await MailMessage.findOne({ _id: body.forwardOfId, accountId: account._id }).lean<any>();
      if (!original) return NextResponse.json({ error: "Original message not found." }, { status: 404 });
      const keep = new Set<number>(Array.isArray(body.forwardAttachments) ? body.forwardAttachments.map(Number) : []);
      (original.attachments ?? []).forEach((a: any, i: number) => {
        if (keep.has(i) && a.storageKey) attachments.push({ ...a, inline: false });
      });
    }
    if (attachments.reduce((s, a) => s + (a.size || 0), 0) > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Attachments can total 25 MB at most." }, { status: 400 });
    }

    if (!(await reserveMemberSends(1))) {
      return NextResponse.json(
        { error: "Chapter mail has reached today's sending limit. Try again tomorrow.", code: "budget" },
        { status: 429 }
      );
    }

    const messageId = `<${randomUUID()}@${mailDomain()}>`;
    const references = parent ? [...(parent.references ?? []), parent.messageId].filter(Boolean).slice(-20) : [];
    const headers: Record<string, string> = { "Message-ID": messageId };
    if (parent?.messageId) {
      headers["In-Reply-To"] = parent.messageId;
      headers["References"] = references.join(" ");
    }
    const displayName = (account.displayName || `${member.fName} ${member.lName}`).replace(/["<>]/g, "").trim();
    const composedHtml = sanitizeComposedHtml(String(body.html || "").slice(0, 500_000));
    const html = composedHtml
      ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${composedHtml}</div>`
      : textToHtml(text);

    const outgoing = {
      // Built here, never read from the request: a member can only ever send
      // as their own address.
      from: displayName ? `${displayName} <${account.address}>` : account.address,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: subject || "(no subject)",
      text,
      html,
      headers,
      attachments: attachments.length
        ? await Promise.all(
            attachments.map(async (a) => ({
              filename: a.filename,
              path: await presignMailGet(a.storageKey, { expiresIn: 900 }),
              content_type: a.contentType,
            }))
          )
        : undefined,
    };

    const clientKey = String(body.clientId || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
    const result = await sendEmail(outgoing, clientKey ? `mail-${account._id}-${clientKey}` : undefined);
    if (!result.ok) {
      await releaseMemberSends(1);
      logger.warn({ status: result.status, error: result.error, accountId: String(account._id) }, "Member mail send failed");
      const status = result.status === 429 ? 429 : result.status >= 400 && result.status < 500 ? 400 : 502;
      return NextResponse.json({ error: result.error || "The message couldn't be sent." }, { status });
    }

    const threadId = parent?.threadId ?? (await resolveThreadId(account._id, "", []));
    const saved = await MailMessage.create({
      accountId: account._id,
      direction: "out",
      folder: "sent",
      threadId,
      messageId,
      inReplyTo: parent?.messageId ?? "",
      references,
      from: account.address,
      fromName: displayName,
      to,
      cc,
      bcc,
      subject: outgoing.subject,
      text,
      html,
      snippet: snippetOf(text),
      attachments,
      read: true,
      resendEmailId: result.id,
      deliveryStatus: "sent",
      date: new Date(),
    });

    if (body.draftId && isObjectId(body.draftId)) {
      await MailMessage.deleteOne({ _id: body.draftId, accountId: account._id, folder: "drafts" });
    }

    logger.info({ accountId: String(account._id), recipients: all.length }, "Member mail sent");
    return NextResponse.json({ ok: true, message: toListItem(saved.toObject()) });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
