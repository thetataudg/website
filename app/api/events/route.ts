import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { checkEventScopeAccess } from "@/lib/eventAuth";
import { createEvent } from "@/lib/events/createEvent";

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
      gemCategory,
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

    const access = await checkEventScopeAccess(member as any, committeeId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const event = await createEvent({
      name,
      description,
      committeeId: committeeId || null,
      startTime,
      endTime,
      location,
      locationKind: body.locationKind,
      virtualPlatform: body.virtualPlatform,
      virtualLink: body.virtualLink,
      eventType,
      gemCategory,
      status,
      visibleToAlumni,
      emailGroups: body.emailGroups ?? null,
      recurrence,
      actorId: member?._id ?? null,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create event");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
