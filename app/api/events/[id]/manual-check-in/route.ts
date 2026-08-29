import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { canManageCheckIn, getMemberByClerk } from "@/lib/checkinAuth";
import { canonicalCheckInSource } from "@/lib/checkinSource";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getMemberByClerk(req);
    const { memberId } = await req.json();

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    // Decided here, not by the caller. The website used to post "Phone" for a
    // hand-added member, which put them on the roster as a scan.
    const checkInSource = canonicalCheckInSource("manual");

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

    const targetMember = await Member.findById(memberId).lean();
    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (event.attendees && !Array.isArray(event.attendees)) {
      await Event.collection.updateOne(
        { _id: eventId },
        { $set: { attendees: [] } }
      );
    }

    const targetId = new mongoose.Types.ObjectId(memberId);
    const scannerId =
      typeof actor._id === "string" && mongoose.Types.ObjectId.isValid(actor._id)
        ? new mongoose.Types.ObjectId(actor._id)
        : null;
    const update = await Event.updateOne(
      {
        _id: eventId,
        "attendees.memberId": { $ne: targetId },
      },
      {
        $push: {
          attendees: {
            memberId: targetId,
            checkedInAt: new Date(),
            source: checkInSource,
            scannerMemberId: scannerId,
          },
        },
      }
    );

    if (update.matchedCount === 0) {
      return NextResponse.json(
        { status: "already-checked-in" },
        { status: 200 }
      );
    }

    logger.info({ eventId, memberId, source: checkInSource }, "Manual check-in added");
    return NextResponse.json({ status: "checked-in" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to add manual check-in");
    return NextResponse.json({ error: err.message }, { status: 403 });
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

    const targetId = new mongoose.Types.ObjectId(memberId);
    const update = await Event.collection.updateOne(
      { _id: eventId },
      { $pull: { attendees: { memberId: targetId } } } as any
    );

    if (update.modifiedCount === 0) {
      return NextResponse.json({ status: "not-checked-in" }, { status: 200 });
    }

    logger.info(
      { eventId, memberId, removedBy: actor._id?.toString() },
      "Check-in removed"
    );
    return NextResponse.json({ status: "removed" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to remove check-in");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
