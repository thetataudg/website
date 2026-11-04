import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import { memberAttendanceFor } from "@/lib/events/attendance";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

async function getViewer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return member;
}

export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    if (startDate && Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
    }

    // The query and the officer-only detail live in `lib/events/attendance.ts`,
    // shared with the MCP server.
    const result = await memberAttendanceFor(viewer, memberId, startDate, endDate);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch attendance");
    return apiErrorResponse(err);
  }
}
