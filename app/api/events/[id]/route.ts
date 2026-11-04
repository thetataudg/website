import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { loadEventDetail } from "@/lib/events/eventDetail";
import { deleteEventAs, updateEventAs } from "@/lib/events/updateEvent";

async function getMemberByClerk(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return member;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    // Looked up for the permission flags only; a signed-in caller with no
    // member row still gets to read the event, as before.
    const viewer = await Member.findOne({ clerkId }).lean<any>();
    const detail = await loadEventDetail(viewer, params.id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(detail, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch event");
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const member = await getMemberByClerk(req);
    const updates = await req.json();

    // The edit itself lives in `lib/events/updateEvent.ts`, shared with the
    // MCP server so an agent's edit has every side effect the website's has.
    const result = await updateEventAs(member, params.id, updates);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update event");
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const member = await getMemberByClerk(req);
    const result = await deleteEventAs(member, params.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete event");
    return apiErrorResponse(err);
  }
}
