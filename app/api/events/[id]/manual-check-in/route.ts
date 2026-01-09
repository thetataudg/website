import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await getMemberByClerk(req);
    const { memberId } = await req.json();

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const event = await Event.findById(params.id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isAdmin = actor.role === "admin" || actor.role === "superadmin";
    if (!isAdmin) {
      const committee = await Committee.findById(event.committeeId);
      const isHead =
        committee?.committeeHeadId?.toString() === actor._id?.toString();
      if (!isHead) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const targetMember = await Member.findById(memberId).lean();
    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const targetId = new mongoose.Types.ObjectId(memberId);
    const update = await Event.collection.updateOne(
      {
        _id: event._id,
        "attendees.memberId": { $ne: targetId },
      },
      {
        $push: { attendees: { memberId: targetId, checkedInAt: new Date() } },
      }
    );

    if (update.matchedCount === 0) {
      return NextResponse.json(
        { status: "already-checked-in" },
        { status: 200 }
      );
    }

    logger.info({ eventId: event._id, memberId }, "Manual check-in added");
    return NextResponse.json({ status: "checked-in" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to add manual check-in");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
