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

async function canManageEvent(member: any, event: any) {
  if (member.role === "admin" || member.role === "superadmin") return true;
  if (member.isECouncil) return true;
  if (!event.committeeId) return false;
  const committee = await Committee.findById(event.committeeId);
  return committee?.committeeHeadId?.toString() === member._id?.toString();
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req as any);
    await connectDB();
    const event = await Event.findById(params.id)
      .populate("attendees.memberId", "fName lName rollNo")
      .lean();
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (Array.isArray((event as any).attendees)) {
      const ids = (event as any).attendees
        .map((entry: any) => {
          if (entry?.memberId && typeof entry.memberId === "object") {
            if (Array.isArray(entry.memberId)) {
              const first = entry.memberId[0];
              return first?._id || first;
            }
            return entry.memberId._id || entry.memberId;
          }
          return entry?.memberId || entry;
        })
        .filter(Boolean)
        .map((id: any) => id.toString())
        .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

      if (ids.length) {
        const members = await Member.find(
          { _id: { $in: ids } },
          { fName: 1, lName: 1, rollNo: 1 }
        ).lean();
        const memberMap = new Map(
          members.map((m: any) => [m._id.toString(), m])
        );

        (event as any).attendees = (event as any).attendees.map((entry: any) => {
          let raw;
          if (entry?.memberId && typeof entry.memberId === "object") {
            if (Array.isArray(entry.memberId)) {
              const first = entry.memberId[0];
              raw = first?._id || first;
            } else {
              raw = entry.memberId._id || entry.memberId;
            }
          } else {
            raw = entry?.memberId || entry;
          }
          const key = raw ? raw.toString() : "";
          const member = key ? memberMap.get(key) : null;
          const memberIdValue = Array.isArray(entry.memberId)
            ? entry.memberId[0]
            : entry.memberId;
          if (member) {
            return {
              ...entry,
              memberId: {
                _id: member._id,
                fName: member.fName,
                lName: member.lName,
                rollNo: member.rollNo,
              },
            };
          }
          return {
            ...entry,
            memberId: memberIdValue,
          };
        });
      }
    }
    return NextResponse.json(event, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch event");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const member = await getMemberByClerk(req);
    const updates = await req.json();

    const event = await Event.findById(params.id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isAdmin = member.role === "admin" || member.role === "superadmin";
    if (!(await canManageEvent(member, event))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if ("committeeId" in updates && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can change committeeId" },
        { status: 403 }
      );
    }

    const oldCommitteeId = event.committeeId?.toString();

    const nextStatus = updates.status ?? event.status;

    if (nextStatus === "cancelled" && event.status !== "scheduled") {
      return NextResponse.json(
        { error: "Only scheduled events can be cancelled" },
        { status: 400 }
      );
    }
    if (nextStatus === "ongoing" && event.status !== "scheduled") {
      return NextResponse.json(
        { error: "Only scheduled events can be started" },
        { status: 400 }
      );
    }
    if (nextStatus === "completed" && event.status !== "ongoing") {
      return NextResponse.json(
        { error: "Only ongoing events can be ended" },
        { status: 400 }
      );
    }

    Object.assign(event, {
      name: updates.name ?? event.name,
      description: updates.description ?? event.description,
      startTime: updates.startTime ? new Date(updates.startTime) : event.startTime,
      endTime: updates.endTime ? new Date(updates.endTime) : event.endTime,
      location: updates.location ?? event.location,
      gemPointDurationMinutes:
        updates.gemPointDurationMinutes ?? event.gemPointDurationMinutes,
      status: nextStatus,
      visibleToAlumni:
        typeof updates.visibleToAlumni === "boolean"
          ? updates.visibleToAlumni
          : event.visibleToAlumni,
      committeeId: updates.committeeId ?? event.committeeId,
    });

    if (nextStatus === "ongoing" && !event.startedAt) {
      event.startedAt = new Date();
    }
    if (nextStatus === "completed" && !event.endedAt) {
      event.endedAt = new Date();
    }
    if (nextStatus === "cancelled") {
      event.endedAt = new Date();
    }

    await event.save();

    const newCommitteeId = event.committeeId?.toString();
    if (isAdmin && oldCommitteeId && newCommitteeId && oldCommitteeId !== newCommitteeId) {
      await Committee.findByIdAndUpdate(oldCommitteeId, { $pull: { events: event._id } });
      await Committee.findByIdAndUpdate(newCommitteeId, { $addToSet: { events: event._id } });
    }

    return NextResponse.json(event, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update event");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const member = await getMemberByClerk(req);
    const event = await Event.findById(params.id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await canManageEvent(member, event))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await Event.deleteOne({ _id: event._id });
    await Committee.findByIdAndUpdate(event.committeeId, {
      $pull: { events: event._id },
    });

    return NextResponse.json({ status: "deleted" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete event");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
