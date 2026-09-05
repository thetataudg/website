// app/api/clerk/webhook/route.ts
//
// Records Clerk email events and sends messages through Resend when Clerk's
// delivery toggle is disabled for the template.
//
// Configure it in the Clerk Dashboard under Webhooks, subscribed to
// `email.created`, pointing at https://ttdg.org/api/clerk/webhook, then put the
// signing secret in CLERK_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import EmailDelivery from "@/lib/models/EmailDelivery";
import logger from "@/lib/logger";
import { verifyClerkWebhook } from "@/lib/clerkWebhook";
import { sendClerkEmail } from "@/lib/notify/clerkEmailDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Read the body exactly once, as text: the HMAC is over these bytes, so
  // anything that reparses and re-serialises first will never match.
  const rawBody = await req.text();

  const verdict = verifyClerkWebhook(
    rawBody,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    process.env.CLERK_WEBHOOK_SECRET
  );

  if (!verdict.ok) {
    logger.warn({ reason: verdict.reason }, "Rejected a Clerk webhook");
    // 401 rather than 500 even when the secret is missing: an unverified body
    // must never reach the database, and Svix retrying will not fix config.
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Answer 200 on a body we cannot parse. Svix retries non-2xx, and a retry
    // will not make it parseable.
    logger.warn("Clerk webhook body was not JSON");
    return NextResponse.json({ ok: true, ignored: "unparseable" }, { status: 200 });
  }

  if (event?.type !== "email.created") {
    return NextResponse.json({ ok: true, ignored: event?.type ?? "unknown" }, { status: 200 });
  }

  const d = event.data ?? {};
  const to = String(d.to_email_address ?? "").trim().toLowerCase();
  if (!d.id || !to) {
    return NextResponse.json({ ok: true, ignored: "no id or recipient" }, { status: 200 });
  }

  try {
    await connectDB();

    const existing: any = await EmailDelivery.findOne({ clerkEmailId: d.id }).lean();
    if (
      d.delivered_by_clerk === false &&
      existing?.provider === "resend" &&
      existing?.status === "sent"
    ) {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    let status = d.status ?? null;
    let provider = d.delivered_by_clerk === false ? "resend" : "clerk";
    let providerMessageId: string | null = null;
    let sendError: string | null = null;

    if (d.delivered_by_clerk === false) {
      const result = await sendClerkEmail({
        id: String(d.id),
        slug: String(d.slug ?? ""),
        to,
        subject: d.subject ?? null,
        body: d.body ?? null,
        bodyPlain: d.body_plain ?? null,
        data: d.data && typeof d.data === "object" ? d.data : {},
      });

      if (result.sent) {
        status = "sent";
        providerMessageId = result.messageId;
      } else {
        status = "failed";
        sendError = result.reason;
      }
    }

    await EmailDelivery.findOneAndUpdate(
      { clerkEmailId: d.id },
      {
        $set: {
          clerkEmailId: d.id,
          toEmailAddress: to,
          slug: d.slug ?? null,
          status,
          subject: d.subject ?? null,
          deliveredByClerk: d.delivered_by_clerk ?? null,
          provider,
          providerMessageId,
          sendError,
          occurredAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        },
      },
      { upsert: true, new: true }
    );

    logger.info(
      { clerkEmailId: d.id, to, slug: d.slug, status, provider },
      "Recorded Clerk email event"
    );

    if (sendError) {
      logger.error(
        { clerkEmailId: d.id, to, slug: d.slug, reason: sendError },
        "Could not deliver Clerk email through Resend"
      );
      return NextResponse.json({ error: "Could not deliver email" }, { status: 500 });
    }
  } catch (err: any) {
    logger.error({ err }, "Failed to record Clerk email event");
    // Genuinely our fault, so let Svix try again.
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
