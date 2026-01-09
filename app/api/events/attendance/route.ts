import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
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

    const memberObjectId = new mongoose.Types.ObjectId(memberId);
    const attendeeIdMatch = { $in: [memberObjectId, memberId] };

    // Use raw collection queries to avoid schema casting errors on legacy data.
    const rawFilter: any = {
      $or: [
        { "attendees.memberId": attendeeIdMatch },
        { attendees: attendeeIdMatch },
      ],
    };

    const isPrivileged =
      viewer.role === "admin" ||
      viewer.role === "superadmin" ||
      viewer.isECouncil;

    const rawEvents = await Event.collection
      .find(rawFilter)
      .sort({ startTime: -1 })
      .toArray();

    const inRange = (date: Date | null) => {
      if (!Object.keys(range).length) return true;
      if (!date || Number.isNaN(date.getTime())) return false;
      if (range.$gte && date < range.$gte) return false;
      if (range.$lte && date > range.$lte) return false;
      return true;
    };

    const filtered = rawEvents.filter((event: any) => {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const matchingEntry = attendees.find((entry: any) => {
        if (entry?.memberId?.toString?.() === memberId) return true;
        if (entry?.memberId === memberId) return true;
        if (entry?.toString?.() === memberId) return true;
        return false;
      });
      const checkedInAtRaw = matchingEntry?.checkedInAt || null;
      const checkedInAt = checkedInAtRaw ? new Date(checkedInAtRaw) : null;
      const eventDate = checkedInAt || (event.startTime ? new Date(event.startTime) : null);
      return inRange(eventDate);
    });

    if (!isPrivileged) {
      return NextResponse.json({ total: filtered.length }, { status: 200 });
    }

    const committeeIds = Array.from(
      new Set(
        filtered
          .map((event: any) => event.committeeId)
          .filter(Boolean)
          .map((id: any) => id.toString())
      )
    ).map((id: string) => new mongoose.Types.ObjectId(id));

    const committees = committeeIds.length
      ? await Committee.find({ _id: { $in: committeeIds } }, { name: 1 }).lean()
      : [];
    const committeeMap = new Map(
      committees.map((c: any) => [c._id.toString(), c.name])
    );

    const formatted = filtered.map((event: any) => {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const checkedInEntry = attendees.find((entry: any) => {
        if (entry?.memberId?.toString?.() === memberId) return true;
        if (entry?.memberId === memberId) return true;
        if (entry?.toString?.() === memberId) return true;
        return false;
      });
      const checkedInAtRaw = checkedInEntry?.checkedInAt || null;
      const committeeId =
        event.committeeId ? event.committeeId.toString() : null;
      const committeeName = committeeId
        ? committeeMap.get(committeeId) || "Committee"
        : "Chapter";

      return {
        _id: event._id,
        name: event.name,
        startTime: event.startTime,
        eventType:
          event.eventType || (event.committeeId ? "event" : "chapter"),
        committeeId: committeeId,
        committeeName,
        checkedInAt: checkedInAtRaw,
      };
    });

    return NextResponse.json({ events: formatted }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch attendance");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
