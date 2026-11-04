import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import mongoose from "mongoose";
import Event from "@/lib/models/Event";
import { existingMemberIds, pushManualCheckIns, removeCheckIn } from "@/lib/events/attendance";
import logger from "@/lib/logger";
import { canManageCheckIn, getMemberByClerk } from "@/lib/checkinAuth";
import { canonicalCheckInSource } from "@/lib/checkinSource";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getMemberByClerk(req);
    const body = await req.json();

    // One member, or many. The bulk form exists for "check in everyone who
    // RSVP'd": a roll of forty is one request and one refresh instead of forty
    // of each, and every id still goes through the same dedupe below.
    const bulk = Array.isArray(body?.memberIds);
    const requested: string[] = bulk
      ? Array.from(new Set<string>(body.memberIds.map((id: unknown) => String(id))))
      : body?.memberId
      ? [String(body.memberId)]
      : [];

    if (
      !requested.length ||
      requested.some((id) => !mongoose.Types.ObjectId.isValid(id))
    ) {
      return NextResponse.json(
        { error: bulk ? "memberIds is required" : "memberId is required" },
        { status: 400 }
      );
    }
    if (requested.length > 500) {
      return NextResponse.json({ error: "Too many members" }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const eventId = new mongoose.Types.ObjectId(params.id);
    const event = await Event.collection.findOne({ _id: eventId });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await canManageCheckIn(actor, event))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existingIds = await existingMemberIds(requested);
    if (!bulk && !existingIds.has(requested[0])) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // The conditional push (and the legacy-shape repair) is shared with the
    // MCP server: `lib/events/attendance.ts`.
    const added = await pushManualCheckIns({
      eventId,
      memberIds: requested,
      existingIds,
      actorId: actor._id,
    });

    if (bulk) {
      logger.info(
        { eventId, requested: requested.length, added, source: canonicalCheckInSource("manual") },
        "Bulk manual check-in added"
      );
      return NextResponse.json({ status: "checked-in", added }, { status: 200 });
    }

    if (added === 0) {
      return NextResponse.json(
        { status: "already-checked-in" },
        { status: 200 }
      );
    }

    logger.info(
      { eventId, memberId: requested[0], source: canonicalCheckInSource("manual") },
      "Manual check-in added"
    );
    return NextResponse.json({ status: "checked-in" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to add manual check-in");
    return apiErrorResponse(err);
  }
}

/**
 * Takes somebody back off the attendance list.
 *
 * Scanning the wrong person, or the same phone twice under two accounts, is a
 * thing that happens at a door with a queue behind it. Attendance is what GEM
 * counts, so an entry that shouldn't be there has to be removable by whoever
 * is running the event, not only by an admin with database access.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getMemberByClerk(req);
    const { memberId } = await req.json();

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventId = new mongoose.Types.ObjectId(params.id);
    const event = await Event.collection.findOne({ _id: eventId });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await canManageCheckIn(actor, event))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const removed = await removeCheckIn(eventId, memberId);

    if (!removed) {
      return NextResponse.json({ status: "not-checked-in" }, { status: 200 });
    }

    logger.info(
      { eventId, memberId, removedBy: actor._id?.toString() },
      "Check-in removed"
    );
    return NextResponse.json({ status: "removed" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to remove check-in");
    return apiErrorResponse(err);
  }
}
