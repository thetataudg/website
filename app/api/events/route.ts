import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { createEventAs } from "@/lib/events/createEvent";
import { listEventsFor } from "@/lib/events/listEvents";

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

    const statuses = statusParam
      ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    // Visibility and the per-row permission flags live in
    // `lib/events/listEvents.ts`, shared with the MCP server.
    const withAccess = await listEventsFor(member, {
      committeeId,
      includePast,
      statuses,
    });

    return NextResponse.json(withAccess, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list events");
    return apiErrorResponse(err);
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

    const result = await createEventAs(member, {
      name,
      description,
      committeeId,
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
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    const event = result.value;

    return NextResponse.json(event, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create event");
    return apiErrorResponse(err);
  }
}
