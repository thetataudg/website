import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

async function getMemberByClerk(req: Request) {
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
    const member = await getMemberByClerk(req);
    const { searchParams } = new URL(req.url);
    const committeeId = searchParams.get("committeeId");
    const includePast = searchParams.get("includePast") === "true";
    const statusParam = searchParams.get("status");

    const now = new Date();
    const filter: any = {};
    if (committeeId) filter.committeeId = committeeId;
    if (!includePast) {
      filter.endTime = { $gte: now };
    }
    if (statusParam) {
      const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else if (statuses.length > 1) {
        filter.status = { $in: statuses };
      }
    }
    if (member.status === "Alumni") {
      filter.visibleToAlumni = true;
    }

    const events = await Event.find(filter)
      .sort({ startTime: 1 })
      .lean();

    return NextResponse.json(events, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list events");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    const member = await getMemberByClerk(req);
    const body = await req.json();

    const {
      name,
      description = "",
      committeeId,
      startTime,
      endTime,
      location = "",
      gemPointDurationMinutes = 0,
      eventType = "event",
      status = "scheduled",
      visibleToAlumni = true,
      recurrence = {},
    } = body;

    if (!name || !startTime || !endTime) {
      return NextResponse.json(
        { error: "name, startTime, endTime are required" },
        { status: 400 }
      );
    }

    const isAdmin = member.role === "admin" || member.role === "superadmin";
    const isECouncil = member.isECouncil;
    const isChapterWide = !committeeId;

    let committee = null;
    let isHeadOrMember = false;
    if (!isChapterWide) {
      committee = await Committee.findById(committeeId);
      if (!committee) {
        return NextResponse.json(
          { error: "Committee not found" },
          { status: 404 }
        );
      }
      const headId = committee.committeeHeadId?.toString();
      const memberIds = (committee.committeeMembers || []).map((id: any) =>
        id.toString()
      );
      isHeadOrMember =
        headId === member._id?.toString() ||
        memberIds.includes(member._id?.toString());
    }

    if (isChapterWide) {
      if (!isAdmin && !isECouncil) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!isAdmin && !isECouncil && !isHeadOrMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedEventType =
      eventType === "meeting" || eventType === "chapter" || eventType === "event"
        ? eventType
        : "event";

    const normalizedRecurrence = {
      enabled: !!recurrence?.enabled,
      frequency:
        recurrence?.frequency === "daily" ||
        recurrence?.frequency === "weekly" ||
        recurrence?.frequency === "monthly"
          ? recurrence.frequency
          : "weekly",
      interval: Number(recurrence?.interval) || 1,
      endDate: recurrence?.endDate ? new Date(recurrence.endDate) : null,
    };

    const eventDoc = {
      name: name.trim(),
      description,
      committeeId: committeeId || null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      startedAt: null,
      endedAt: null,
      location,
      gemPointDurationMinutes,
      eventType: normalizedEventType,
      recurrence: normalizedRecurrence,
      status,
      visibleToAlumni,
      attendees: [],
    };

    let event;
    if (!committeeId) {
      const created = new Event(eventDoc);
      await created.save({ validateBeforeSave: false });
      event = created.toObject();
    } else {
      event = await Event.create(eventDoc);
    }

    if (event?._id) {
      await Event.collection.updateOne(
        { _id: event._id },
        { $set: { eventType: normalizedEventType, recurrence: normalizedRecurrence } }
      );
      event.recurrence = normalizedRecurrence;
    }

    if (committeeId) {
      await Committee.findByIdAndUpdate(committeeId, {
        $addToSet: { events: event._id },
      });
    }

    logger.info({ eventId: event._id }, "Event created");
    return NextResponse.json(event, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create event");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
