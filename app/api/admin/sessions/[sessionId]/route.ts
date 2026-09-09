// app/api/admin/sessions/[sessionId]/route.ts
// Signing a device out from the admin console.
//
// Admins only, and never the caller's own session: an admin who revokes the
// tab they are working in is signed out mid-task with no obvious cause, which
// reads as a bug. Clerk's own account screen is the right place to do that.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { requireRole } from "@/lib/clerk";
import { revokeSession } from "@/lib/clerkSessions";
import { connectDB } from "@/lib/db";
import RevokedSession from "@/lib/models/RevokedSession";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  let admin;
  try {
    admin = await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode ?? 401 }
    );
  }

  const sessionId = String(params?.sessionId || "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const { sessionId: callerSessionId } = await auth();
  if (callerSessionId && callerSessionId === sessionId) {
    return NextResponse.json(
      { error: "You cannot revoke the session you are currently using." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  try {
    await revokeSession(sessionId);

    // Written after the revoke, not before: a note explaining a sign-out that
    // did not happen is worse than no note. Failing to write it must not turn
    // a successful revoke into an error, so it is caught separately — the
    // member is signed out either way, they just miss the explanation.
    try {
      await connectDB();
      await RevokedSession.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            sessionId,
            clerkId: String(body?.clerkId || ""),
            revokedByRollNo: admin.rollNo,
            deviceLabel: String(body?.deviceLabel || ""),
            revokedAt: new Date(),
            acknowledgedAt: null,
          },
        },
        { upsert: true }
      );
    } catch (noteErr) {
      logger.warn({ err: noteErr, sessionId }, "Revoke note not recorded");
    }

    logger.info(
      { admin: admin.rollNo, sessionId },
      "Session revoked from admin console"
    );
    return NextResponse.json({ revoked: true }, { status: 200 });
  } catch (err: any) {
    logger.error({ err, sessionId }, "Failed to revoke session");
    return NextResponse.json(
      { error: err.message ?? "Failed to revoke session" },
      { status: 500 }
    );
  }
}
