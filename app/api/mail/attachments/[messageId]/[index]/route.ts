// app/api/mail/attachments/[messageId]/[index]/route.ts
// Download one attachment, only from a message in your own mailbox.
import { NextRequest, NextResponse } from "next/server";
import MailMessage from "@/lib/models/MailMessage";
import logger from "@/lib/logger";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { presignMailGet } from "@/lib/mail/storage";
import { copyAttachments } from "@/lib/mail/ingest";
import { listReceivedAttachments } from "@/lib/mail/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { messageId: string; index: string } }) {
  try {
    const { account } = await requireMailbox();
    const index = Number(params.index);
    if (!isObjectId(params.messageId) || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const message = await MailMessage.findOne({ _id: params.messageId, accountId: account._id }).lean<any>();
    const attachment = message?.attachments?.[index];
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const inline = req.nextUrl.searchParams.get("inline") === "1";

    // Not copied yet (large, or the webhook's copy failed): try once more, and
    // if that doesn't land, send them straight to Resend's short-lived link.
    if (!attachment.storageKey && message.resendEmailId && attachment.resendAttachmentId) {
      await copyAttachments(message.resendEmailId).catch(() => undefined);
      const refreshed = await MailMessage.findOne({ _id: message._id, accountId: account._id }).lean<any>();
      const copied = refreshed?.attachments?.[index];
      if (copied?.storageKey) {
        return NextResponse.redirect(await presignMailGet(copied.storageKey, { filename: copied.filename, inline }));
      }
      const listed = await listReceivedAttachments(message.resendEmailId);
      const source = listed.find((a) => a.id === attachment.resendAttachmentId);
      if (source?.download_url) return NextResponse.redirect(source.download_url);
      logger.warn({ messageId: params.messageId, index }, "Attachment unavailable");
      return NextResponse.json({ error: "This attachment is no longer available." }, { status: 410 });
    }

    if (!attachment.storageKey) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(await presignMailGet(attachment.storageKey, { filename: attachment.filename, inline }));
  } catch (err) {
    return mailErrorResponse(err);
  }
}
