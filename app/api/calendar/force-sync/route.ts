import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { syncAllEvents } from "@/lib/calendar";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    const member = await Member.findOne({ clerkId }).lean<{
      role?: string;
      isCommitteeHead?: boolean;
      isECouncil?: boolean;
    }>();
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const canForceSync =
      member.role === "admin" ||
      member.role === "superadmin" ||
      member.isCommitteeHead;
    if (!canForceSync) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const results = await syncAllEvents();
    const synced = results.filter((item) => item.status === "synced").length;
    const skipped = results.filter((item) => item.status === "skipped").length;

    return NextResponse.json(
      { status: "ok", total: results.length, synced, skipped },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Calendar force sync failed");
    return NextResponse.json(
      { error: err?.message || "Calendar sync failed" },
      { status: 500 }
    );
  }
}
