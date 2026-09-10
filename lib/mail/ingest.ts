// lib/mail/ingest.ts
// Turning a Resend `email.received` event into messages in mailboxes.
import logger from "@/lib/logger";
import MailAccount from "@/lib/models/MailAccount";
import MailMessage from "@/lib/models/MailMessage";
import {
  getReceivedEmail,
  headerValue,
  listReceivedAttachments,
  type ReceivedEmail,
} from "@/lib/mail/resend";
import { sanitizeEmailHtml, snippetOf } from "@/lib/mail/content";
import { parseReferences, resolveThreadId } from "@/lib/mail/threading";
import { bareAddress, displayNameOf, isOurDomain } from "@/lib/mail/address";
import { putMailObject, safeFilename, storageConfigured } from "@/lib/mail/storage";
import { notifyNewMail } from "@/lib/mail/notify";

/// Anything bigger stays in Resend and is fetched on demand instead of copied.
const MAX_COPY_BYTES = 25 * 1024 * 1024;

export interface IngestResult {
  delivered: number;
  dropped: string[];
  messageIds: string[];
}

/// Store one received email in every chapter mailbox it was addressed to.
///
/// Idempotent: the (resendEmailId, accountId) unique index turns a webhook
/// retry into a no-op for each mailbox it already reached.
export async function ingestReceivedEmail(emailId: string, hint?: any): Promise<IngestResult> {
  const email = await getReceivedEmail(emailId);
  if (!email) throw new Error(`Could not fetch received email ${emailId}`);

  const recipients = Array.from(
    new Set(
      [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? []), ...(hint?.to ?? []), ...(hint?.cc ?? []), ...(hint?.bcc ?? [])]
        .map(bareAddress)
        .filter((address) => address && isOurDomain(address))
    )
  );

  const result: IngestResult = { delivered: 0, dropped: [], messageIds: [] };
  if (!recipients.length) return result;

  const accounts = await MailAccount.find({ address: { $in: recipients }, status: "active" })
    .populate("memberId", "status")
    .lean<any[]>();
  const live = accounts.filter((a) => ["Active", "Alumni"].includes(a.memberId?.status));
  const liveAddresses = new Set(live.map((a) => a.address));
  result.dropped = recipients.filter((r) => !liveAddresses.has(r));

  const messageId = email.message_id || headerValue(email, "message-id");
  const inReplyTo = parseReferences(headerValue(email, "in-reply-to"))[0] || "";
  const references = parseReferences(headerValue(email, "references"));
  const html = sanitizeEmailHtml(email.html || "");
  const text = email.text || "";
  const fromRaw = headerValue(email, "from") || email.from || "";
  const attachments = (email.attachments ?? hint?.attachments ?? []).map((a: any) => ({
    filename: safeFilename(a.filename),
    contentType: a.content_type || "application/octet-stream",
    size: a.size ?? 0,
    storageKey: "",
    resendAttachmentId: a.id,
    contentId: String(a.content_id || "").replace(/^<|>$/g, ""),
    inline: a.content_disposition === "inline",
    state: "pending",
  }));

  for (const account of live) {
    try {
      const threadId = await resolveThreadId(account._id, inReplyTo, references);
      const doc = await MailMessage.create({
        accountId: account._id,
        direction: "in",
        folder: "inbox",
        threadId,
        messageId,
        inReplyTo,
        references,
        from: bareAddress(fromRaw),
        fromName: displayNameOf(fromRaw),
        to: (email.to ?? []).map(bareAddress),
        cc: (email.cc ?? []).map(bareAddress),
        replyTo: (email.reply_to ?? []).map(bareAddress),
        subject: email.subject || "",
        text,
        html,
        snippet: snippetOf(text, html),
        attachments,
        read: false,
        resendEmailId: emailId,
        deliveryStatus: "received",
        date: email.created_at ? new Date(email.created_at) : new Date(),
      });
      result.delivered += 1;
      result.messageIds.push(String(doc._id));
      await notifyNewMail(account.memberId?._id ?? account.memberId, displayNameOf(fromRaw) || bareAddress(fromRaw), email.subject || "");
    } catch (err: any) {
      if (err?.code === 11000) continue; // already delivered on an earlier attempt
      throw err;
    }
  }

  if (result.dropped.length) {
    logger.info({ emailId, dropped: result.dropped }, "Inbound mail for unknown or inactive mailboxes dropped");
  }
  return result;
}

/// Copy a message's attachments out of Resend into our bucket. Resend's
/// download links last an hour, so anything left there is lost after that.
export async function copyAttachments(emailId: string): Promise<void> {
  if (!storageConfigured()) {
    logger.warn({ emailId }, "Mail storage not configured; attachments left in Resend");
    return;
  }
  const messages = await MailMessage.find({ resendEmailId: emailId, "attachments.state": "pending" });
  if (!messages.length) return;

  const listed = await listReceivedAttachments(emailId);
  const byId = new Map(listed.map((a) => [a.id, a]));

  // Every mailbox that got this email shares one copy of each file.
  const stored = new Map<string, string>();
  for (const message of messages) {
    for (const attachment of message.attachments as any[]) {
      if (attachment.state !== "pending") continue;
      const source = byId.get(attachment.resendAttachmentId);
      if (!source?.download_url) {
        attachment.state = "failed";
        continue;
      }
      try {
        let key = stored.get(source.id);
        if (!key) {
          if ((source.size ?? 0) > MAX_COPY_BYTES) throw new Error("too large to copy");
          const res = await fetch(source.download_url);
          if (!res.ok) throw new Error(`download ${res.status}`);
          const bytes = Buffer.from(await res.arrayBuffer());
          key = `mail/in/${emailId}/${source.id}/${safeFilename(attachment.filename)}`;
          await putMailObject(key, bytes, attachment.contentType);
          stored.set(source.id, key);
        }
        attachment.storageKey = key;
        attachment.size = attachment.size || source.size || 0;
        attachment.state = "ready";
      } catch (err) {
        logger.warn({ err, emailId, attachmentId: source.id }, "Could not copy an inbound attachment");
        attachment.state = "failed";
      }
    }
    message.markModified("attachments");
    await message.save();
  }
}

export type { ReceivedEmail };
