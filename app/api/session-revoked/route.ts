// app/api/session-revoked/route.ts
// "Why am I suddenly signed out?"
//
// Reachable without a session, necessarily: the member asking has just lost
// theirs. The browser supplies the Clerk id it remembered while signed in, and
// the answer is a yes or no plus a timestamp — never a name, an email, or who
// did it. A caller who already knows someone's opaque Clerk id learns only
// that an admin signed that id out in the last day, which is exactly what the
// person holding the browser is entitled to know.
//
// Rate limited per IP because it is public, and the record deletes itself
// after 24 hours (a TTL index on the model).
import { NextResponse } from "next/server";

import { connectDB } from "@/lib/db";
import RevokedSession from "@/lib/models/RevokedSession";
import { rateLimit } from "@/lib/rateLimit";
import { getRequestSource } from "@/lib/request-source";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Clerk ids are `user_` followed by base58-ish characters. Checked so a
/// malformed id is rejected before it reaches the database.
const CLERK_ID = /^user_[A-Za-z0-9]{10,40}$/;

export async function GET(req: Request) {
  const { ip } = getRequestSource(req as any);
  const limit = rateLimit(`session-revoked:${ip || "unknown"}`, 20, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const clerkId = new URL(req.url).searchParams.get("clerkId") ?? "";
  if (!CLERK_ID.test(clerkId)) {
    return NextResponse.json({ revoked: false }, { status: 200 });
  }

  try {
    await connectDB();
    const record = await RevokedSession.findOne({
      clerkId,
      acknowledgedAt: null,
    })
      .sort({ revokedAt: -1 })
      .lean<any>();

    if (!record) return NextResponse.json({ revoked: false }, { status: 200 });

    return NextResponse.json(
      {
        revoked: true,
        sessionId: record.sessionId,
        revokedAt: new Date(record.revokedAt).toISOString(),
        deviceLabel: record.deviceLabel || "",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to read revoke note");
    // A member who cannot be told why is shown the ordinary sign-in prompt,
    // which is the status quo — not an error page.
    return NextResponse.json({ revoked: false }, { status: 200 });
  }
}

/// Marks the note as delivered, so it is shown once rather than on every
/// visit until the row expires.
export async function POST(req: Request) {
  const { ip } = getRequestSource(req as any);
  const limit = rateLimit(`session-revoked-ack:${ip || "unknown"}`, 20, 60);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const sessionId = String(body?.sessionId || "").trim();
  if (!sessionId) {
    return NextResponse.json({ acknowledged: false }, { status: 400 });
  }

  try {
    await connectDB();
    await RevokedSession.updateOne(
      { sessionId },
      { $set: { acknowledgedAt: new Date() } }
    );
    return NextResponse.json({ acknowledged: true }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to acknowledge revoke note");
    return NextResponse.json({ acknowledged: false }, { status: 200 });
  }
}
