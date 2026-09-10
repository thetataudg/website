// app/api/mail/webhook/route.ts
//
// Resend events for chapter mail: inbound email, and delivery updates for
// mail members sent.
//
// Configure in the Resend dashboard under Webhooks, pointing at
// https://ttdg.org/api/mail/webhook, subscribed to email.received,
// email.delivered, email.bounced, email.complained and
// email.delivery_delayed. The signing secret goes in RESEND_MAIL_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import MailMessage from "@/lib/models/MailMessage";
import { verifySvixWebhook } from "@/lib/clerkWebhook";
import { copyAttachments, ingestReceivedEmail } from "@/lib/mail/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

/// Attachments are copied inside the webhook only when they are small enough
/// to finish well before the function times out. Bigger ones are fetched from
/// Resend the first time someone opens them.
const INLINE_COPY_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const verdict = verifySvixWebhook(
    rawBody,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    process.env.RESEND_MAIL_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET
  );
  if (!verdict.ok) {
    logger.warn({ reason: verdict.reason }, "Rejected a Resend mail webhook");
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const type = String(event?.type || "");
  const emailId = String(event?.data?.email_id || "");
  if (!emailId) return NextResponse.json({ ok: true, ignored: "no email id" });

  try {
    await connectDB();

    if (type === "email.received") {
      const result = await ingestReceivedEmail(emailId, event.data);
      const attachments: any[] = event.data?.attachments ?? [];
      const totalSize = attachments.reduce((sum, a) => sum + (Number(a?.size) || 0), 0);
      if (result.delivered && attachments.length && totalSize <= INLINE_COPY_BYTES) {
        await copyAttachments(emailId).catch((err) =>
          logger.warn({ err, emailId }, "Inline attachment copy failed; will fetch on demand")
        );
      }
      logger.info({ emailId, delivered: result.delivered, dropped: result.dropped.length }, "Inbound chapter mail processed");
      return NextResponse.json({ ok: true, delivered: result.delivered });
    }

    const status = DELIVERY_STATUS[type];
    if (status) {
      await MailMessage.updateMany(
        { resendEmailId: emailId, direction: "out" },
        { $set: { deliveryStatus: status } }
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  } catch (err) {
    logger.error({ err, emailId, type }, "Failed to process Resend mail webhook");
    // Ours to fix, and a retry may succeed, so let Svix try again.
    return NextResponse.json({ error: "Could not process event" }, { status: 500 });
  }
}
