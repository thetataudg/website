// app/api/mail/drafts/route.ts
// Save (create or update) a draft in the signed-in member's mailbox.
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import MailMessage from "@/lib/models/MailMessage";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { bareAddress } from "@/lib/mail/address";
import { sanitizeComposedHtml, snippetOf } from "@/lib/mail/content";
import { safeFilename } from "@/lib/mail/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const list = (value: any) =>
  (Array.isArray(value) ? value : String(value || "").split(/[,;]/))
    .map((v: any) => bareAddress(String(v)))
    .filter(Boolean)
    .slice(0, 50);

export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const body = await req.json().catch(() => ({}));
    const ownPrefix = `mail/out/${account._id}/`;
    const text = String(body.text || "").slice(0, 200_000);
    const html = sanitizeComposedHtml(String(body.html || "").slice(0, 500_000));
    const fields = {
      to: list(body.to),
      cc: list(body.cc),
      bcc: list(body.bcc),
      subject: String(body.subject || "").replace(/[\r\n]+/g, " ").slice(0, 300),
      text,
      html,
      snippet: snippetOf(text, html),
      attachments: (Array.isArray(body.attachments) ? body.attachments : [])
        .filter((a: any) => String(a?.key || "").startsWith(ownPrefix))
        .slice(0, 20)
        .map((a: any) => ({
          filename: safeFilename(a.filename),
          contentType: String(a.contentType || "application/octet-stream").slice(0, 100),
          size: Number(a.size) || 0,
          storageKey: String(a.key),
          state: "ready",
        })),
      date: new Date(),
    };

    if (body.draftId && isObjectId(body.draftId)) {
      const updated = await MailMessage.findOneAndUpdate(
        { _id: body.draftId, accountId: account._id, folder: "drafts" },
        { $set: fields },
        { new: true }
      ).lean<any>();
      if (updated) return NextResponse.json({ draftId: String(updated._id) });
    }

    const created = await MailMessage.create({
      accountId: account._id,
      direction: "out",
      folder: "drafts",
      threadId: new Types.ObjectId().toString(),
      from: account.address,
      fromName: account.displayName,
      read: true,
      deliveryStatus: "draft",
      ...fields,
    });
    return NextResponse.json({ draftId: String(created._id) }, { status: 201 });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
