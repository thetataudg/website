import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

async function updateHeadFlags(oldHeadId?: string | null, newHeadId?: string | null, committeeId?: string) {
  if (newHeadId) {
    await Member.findByIdAndUpdate(newHeadId, { isCommitteeHead: true });
  }

  if (oldHeadId && oldHeadId !== newHeadId) {
    const stillHead = await Committee.exists({
      _id: { $ne: committeeId },
      committeeHeadId: oldHeadId,
    });
    if (!stillHead) {
      await Member.findByIdAndUpdate(oldHeadId, { isCommitteeHead: false });
    }
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req as any);
    await connectDB();

    const committee = await Committee.findById(params.id)
      .populate("committeeHeadId", "fName lName rollNo")
      .populate("committeeMembers", "fName lName rollNo")
      .populate("events", "name startTime endTime status")
      .lean();

    if (!committee) {
      return NextResponse.json({ error: "Committee not found" }, { status: 404 });
    }

    return NextResponse.json(committee, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch committee");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
    await connectDB();

    const updates = await req.json();
    const committee = await Committee.findById(params.id);
    if (!committee) {
      return NextResponse.json({ error: "Committee not found" }, { status: 404 });
    }

    const oldHeadId = committee.committeeHeadId?.toString();

    if ("name" in updates && typeof updates.name === "string") {
      committee.name = updates.name.trim();
    }
    if ("description" in updates) {
      committee.description = updates.description || "";
    }
    if ("committeeHeadId" in updates) {
      committee.committeeHeadId = updates.committeeHeadId || null;
    }
    if ("committeeMembers" in updates) {
      committee.committeeMembers = Array.isArray(updates.committeeMembers)
        ? updates.committeeMembers
        : [];
    }

    await committee.save();

    const newHeadId = committee.committeeHeadId?.toString();
    await updateHeadFlags(oldHeadId, newHeadId, committee._id.toString());

    return NextResponse.json(committee, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update committee");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
    await connectDB();

    const committee = await Committee.findById(params.id);
    if (!committee) {
      return NextResponse.json({ error: "Committee not found" }, { status: 404 });
    }

    const headId = committee.committeeHeadId?.toString();

    await Event.deleteMany({ committeeId: committee._id });
    await Committee.deleteOne({ _id: committee._id });

    await updateHeadFlags(headId, null, committee._id.toString());

    return NextResponse.json({ status: "deleted" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete committee");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
