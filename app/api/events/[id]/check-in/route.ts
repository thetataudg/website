import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { verifyAnyCheckInToken } from "@/lib/checkinCode";

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
    const { code, source, scannerMemberId } = await req.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }
    if (!source || typeof source !== "string") {
      return NextResponse.json({ error: "source is required" }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const eventId = new mongoose.Types.ObjectId(params.id);
    const event = await Event.collection.findOne({ _id: eventId });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (event.status !== "ongoing") {
      return NextResponse.json(
        { error: "Event is not accepting check-ins" },
        { status: 400 }
      );
    }

    const isAdmin = actor.role === "admin" || actor.role === "superadmin";
    const isPrivileged = isAdmin || actor.isECouncil;
    if (!isPrivileged) {
      const committee = await Committee.findById(event.committeeId);
      const isHead =
        committee?.committeeHeadId?.toString() === actor._id?.toString();
      if (!isHead) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const decoded = verifyAnyCheckInToken(code);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(decoded.memberId)) {
      return NextResponse.json(
        { error: "Member referenced in code is invalid" },
        { status: 400 }
      );
    }

    const targetMember = await Member.findById(decoded.memberId).lean<any>();
    if (!targetMember || Array.isArray(targetMember)) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (targetMember.status && targetMember.status !== "Active") {
      return NextResponse.json(
        { error: "Member is not eligible for check-in" },
        { status: 403 }
      );
    }

    if (event.attendees && !Array.isArray(event.attendees)) {
      await Event.collection.updateOne(
        { _id: eventId },
        { $set: { attendees: [] } }
      );
    }

    const targetId = new mongoose.Types.ObjectId(decoded.memberId);
    let scannerObjectId = null;
    if (scannerMemberId && mongoose.Types.ObjectId.isValid(scannerMemberId)) {
      scannerObjectId = new mongoose.Types.ObjectId(scannerMemberId);
    }

    const update = await Event.collection.updateOne(
      {
        _id: eventId,
        "attendees.memberId": { $ne: targetId },
      },
      {
        $push: {
          attendees: {
            memberId: targetId,
            checkedInAt: new Date(),
            source,
            scannerMemberId: scannerObjectId,
          },
        },
      } as any
    );

    if (update.matchedCount === 0) {
      return NextResponse.json(
        { status: "already-checked-in", memberId: decoded.memberId },
        { status: 200 }
      );
    }

    logger.info(
      {
        eventId,
        memberId: decoded.memberId,
        source,
        scannerMemberId,
        tokenType: decoded.type,
      },
      "Checked in member via token"
    );
    return NextResponse.json(
      {
        status: "checked-in",
        memberId: decoded.memberId,
        source,
        scannerMemberId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to check in member");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
