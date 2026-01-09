import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
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

    const range: Record<string, Date> = {};
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
      range.$gte = startDate;
    }
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      range.$lte = endDate;
    }

    const attendeeMatch: any = {
      memberId: new mongoose.Types.ObjectId(memberId),
    };
    if (Object.keys(range).length) {
      attendeeMatch.checkedInAt = range;
    }

    const filter: any = {
      attendees: { $elemMatch: attendeeMatch },
    };

    const isPrivileged =
      viewer.role === "admin" ||
      viewer.role === "superadmin" ||
      viewer.isECouncil;

    const events = await Event.find(filter)
      .populate("committeeId", "name")
      .sort({ startTime: -1 })
      .lean();

    if (!isPrivileged) {
      return NextResponse.json(
        {
          total: events.length,
        },
        { status: 200 }
      );
    }

    const formatted = events.map((event: any) => ({
      _id: event._id,
      name: event.name,
      startTime: event.startTime,
      eventType: event.eventType,
      committeeId: event.committeeId?._id || event.committeeId || null,
      committeeName: event.committeeId?.name || "Chapter",
      checkedInAt:
        event.attendees?.find(
          (entry: any) =>
            entry?.memberId?.toString?.() === memberId ||
            entry?.memberId === memberId
        )?.checkedInAt || null,
    }));

    return NextResponse.json({ events: formatted }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch attendance");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
