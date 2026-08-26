// app/api/clerk/webhook/route.ts
//
// The listener Clerk posts to. Its only job right now is to record `email.created`
// events so the invite screen can say whether Clerk ever actually sent the
// email, which nothing in Clerk's REST API will tell us after the fact.
//
// Configure it in the Clerk Dashboard under Webhooks, subscribed to
// `email.created`, pointing at https://ttdg.org/api/clerk/webhook, then put the
// signing secret in CLERK_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import EmailDelivery from "@/lib/models/EmailDelivery";
import logger from "@/lib/logger";
import { verifyClerkWebhook } from "@/lib/clerkWebhook";

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
    await EmailDelivery.findOneAndUpdate(
      { clerkEmailId: d.id },
      {
        $set: {
          clerkEmailId: d.id,
          toEmailAddress: to,
          slug: d.slug ?? null,
          status: d.status ?? null,
          subject: d.subject ?? null,
          deliveredByClerk: d.delivered_by_clerk ?? null,
          occurredAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        },
      },
      { upsert: true, new: true }
    );

    logger.info(
      { clerkEmailId: d.id, to, slug: d.slug, status: d.status },
      "Recorded Clerk email event"
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to record Clerk email event");
    // Genuinely our fault, so let Svix try again.
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
