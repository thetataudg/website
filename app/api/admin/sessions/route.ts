// app/api/admin/sessions/route.ts
// The signed-in devices behind the admin console's Sessions tab.
//
// Joins Clerk's session rows — the system of record for who is signed in — to
// our own member records, so an admin sees names and roll numbers rather than
// `user_33P9…`. A session whose Clerk user has no member row still appears,
// unnamed: an unrecognised sign-in is the one an admin most wants to see.
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/clerk";
import { listActiveSessions } from "@/lib/clerkSessions";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { ACTIVE_WINDOW_MS, isActiveNow } from "@/lib/presence";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode ?? 401 }
    );
  }

  try {
    await connectDB();

    const [sessions, members] = await Promise.all([
      listActiveSessions(),
      Member.find({ clerkId: { $type: "string" } })
        .select("clerkId rollNo fName lName role isECouncil lastSeenAt lastSeenIosAt lastSeenWebAt")
        .lean<any[]>(),
    ]);

    const byClerkId = new Map(members.map((m) => [String(m.clerkId), m]));

    const rows = sessions.map((session) => {
      const member = byClerkId.get(session.clerkId);
      return {
        ...session,
        rollNo: member?.rollNo ?? null,
        name: member ? `${member.fName} ${member.lName}`.trim() : null,
        role: member?.role ?? null,
        isECouncil: Boolean(member?.isECouncil),
        // Our own stamp, which moves on every API call rather than only when
        // Clerk refreshes a token. Lets the tab say "in the app right now"
        // with more confidence than session activity alone.
        activeInAppNow: isActiveNow(member?.lastSeenIosAt),
        lastSeenAt: member?.lastSeenAt ? new Date(member.lastSeenAt).toISOString() : null,
      };
    });

    const summary = {
      total: rows.length,
      ios: rows.filter((r) => r.platform === "ios").length,
      web: rows.filter((r) => r.platform === "web").length,
      unknown: rows.filter((r) => r.platform === "unknown").length,
      /// Distinct people, not sessions — one member with a phone and a laptop
      /// is two rows but one signed-in brother.
      members: new Set(rows.map((r) => r.clerkId)).size,
      inAppNow: rows.filter((r) => r.activeInAppNow).length,
      activeWindowMinutes: Math.round(ACTIVE_WINDOW_MS / 60000),
    };

    return NextResponse.json(
      { sessions: rows, summary },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to list active sessions");
    return NextResponse.json(
      { error: err.message ?? "Failed to list sessions" },
      { status: 500 }
    );
  }
}
