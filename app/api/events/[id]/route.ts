import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { addRecurrence, applyTimeOfDay } from "@/lib/recurrence";

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

async function ensureFutureOccurrences(parentId: any) {
  const parent = (await Event.findById(parentId).lean()) as any;
  if (!parent || !parent.recurrence?.enabled) return;

  const count = Math.max(Number(parent.recurrence?.count) || 1, 1);
  const now = new Date();

  const existing = await Event.find({
    $or: [{ _id: parentId }, { recurrenceParentId: parentId }],
  })
    .sort({ startTime: 1 })
    .lean();

  const future = existing.filter((evt: any) => evt.startTime >= now);
  if (future.length >= count) return;

  let last = existing[existing.length - 1] || parent;
  let toCreate = count - future.length;

  while (toCreate > 0) {
    const next = addRecurrence(
      new Date(last.startTime),
      new Date(last.endTime),
      {
        frequency: parent.recurrence?.frequency,
        interval: parent.recurrence?.interval,
        endDate: parent.recurrence?.endDate || null,
      }
    );
    if (!next) break;

    const created = await Event.create({
      name: parent.name,
      description: parent.description,
      committeeId: parent.committeeId || null,
      startTime: next.startTime,
      endTime: next.endTime,
      startedAt: null,
      endedAt: null,
      location: parent.location,
      gemPointDurationMinutes: parent.gemPointDurationMinutes,
      eventType: parent.eventType,
      recurrence: { enabled: false },
      status: "scheduled",
      visibleToAlumni: parent.visibleToAlumni,
      attendees: [],
      recurrenceParentId: parentId,
    });
    last = created.toObject();
    toCreate -= 1;
  }
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
    const eventId = (event as any)._id ?? (event as any).id;
    if (!(event as any).recurrence) {
      const raw = await Event.collection.findOne({ _id: eventId });
      if (raw?.recurrence) {
        (event as any).recurrence = raw.recurrence;
      }
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
    const applyToSeries =
      updates.applyToSeries === "series" ? "series" : "single";

    const normalizedEventType =
      updates.eventType === "meeting" ||
      updates.eventType === "chapter" ||
      updates.eventType === "event"
        ? updates.eventType
        : event.eventType;

    const normalizedRecurrence = updates.recurrence
      ? {
          enabled: !!updates.recurrence?.enabled,
          frequency:
            updates.recurrence?.frequency === "daily" ||
            updates.recurrence?.frequency === "weekly" ||
            updates.recurrence?.frequency === "monthly"
              ? updates.recurrence.frequency
              : event.recurrence?.frequency || "weekly",
          interval:
            Number(updates.recurrence?.interval) ||
            event.recurrence?.interval ||
            1,
          endDate: updates.recurrence?.endDate
            ? new Date(updates.recurrence.endDate)
            : updates.recurrence?.endDate === null
            ? null
            : event.recurrence?.endDate || null,
          count: Math.max(
            Number(updates.recurrence?.count) ||
              event.recurrence?.count ||
              1,
            1
          ),
        }
      : event.recurrence;

    const isRecurringInstance = !!event.recurrenceParentId;
    const seriesParentId = isRecurringInstance ? event.recurrenceParentId : null;

    const updatesToApply: any = {
      name: updates.name ?? event.name,
      description: updates.description ?? event.description,
      startTime: updates.startTime ? new Date(updates.startTime) : event.startTime,
      endTime: updates.endTime ? new Date(updates.endTime) : event.endTime,
      location: updates.location ?? event.location,
      gemPointDurationMinutes:
        updates.gemPointDurationMinutes ?? event.gemPointDurationMinutes,
      eventType: normalizedEventType,
      recurrence:
        applyToSeries === "series" || !event.recurrenceParentId
          ? normalizedRecurrence
          : event.recurrence,
      status: nextStatus,
      visibleToAlumni:
        typeof updates.visibleToAlumni === "boolean"
          ? updates.visibleToAlumni
          : event.visibleToAlumni,
      committeeId: updates.committeeId ?? event.committeeId,
    };

    if (nextStatus === "ongoing" && !event.startedAt) {
      updatesToApply.startedAt = new Date();
    }
    if (nextStatus === "completed" && !event.endedAt) {
      updatesToApply.endedAt = new Date();
    }
    if (nextStatus === "cancelled") {
      updatesToApply.endedAt = new Date();
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      event._id,
      { $set: updatesToApply },
      { new: true, runValidators: false }
    );

    if (updatedEvent?._id) {
      await Event.collection.updateOne(
        { _id: updatedEvent._id },
        {
          $set: {
            eventType: normalizedEventType,
            recurrence:
              applyToSeries === "series" || !event.recurrenceParentId
                ? normalizedRecurrence
                : event.recurrence,
          },
        }
      );
    }

    if (applyToSeries === "series") {
      const parentId = seriesParentId || event._id;
      const parent = seriesParentId
        ? await Event.findById(seriesParentId).lean()
        : updatedEvent?.toObject();

      if (parent) {
        const baseStart = updates.startTime
          ? new Date(updates.startTime)
          : new Date(event.startTime);
        const baseEnd = updates.endTime
          ? new Date(updates.endTime)
          : new Date(event.endTime);
        const duration = baseEnd.getTime() - baseStart.getTime();

        const now = new Date();
        const futureInstances = await Event.find({
          recurrenceParentId: parentId,
          startTime: { $gte: now },
        });

        for (const instance of futureInstances) {
          const adjustedStart = applyTimeOfDay(
            new Date(instance.startTime),
            baseStart
          );
          const adjustedEnd = new Date(adjustedStart.getTime() + duration);
          await Event.updateOne(
            { _id: instance._id },
            {
              $set: {
                name: updates.name ?? parent.name,
                description: updates.description ?? parent.description,
                location: updates.location ?? parent.location,
                eventType: normalizedEventType,
                status: nextStatus,
                visibleToAlumni:
                  typeof updates.visibleToAlumni === "boolean"
                    ? updates.visibleToAlumni
                    : parent.visibleToAlumni,
                startTime: updates.startTime ? adjustedStart : instance.startTime,
                endTime: updates.endTime ? adjustedEnd : instance.endTime,
              },
            }
          );
        }

        if (seriesParentId) {
          await Event.updateOne(
            { _id: parentId },
            {
              $set: {
                name: updates.name ?? parent.name,
                description: updates.description ?? parent.description,
                location: updates.location ?? parent.location,
                eventType: normalizedEventType,
                recurrence: normalizedRecurrence,
                visibleToAlumni:
                  typeof updates.visibleToAlumni === "boolean"
                    ? updates.visibleToAlumni
                    : parent.visibleToAlumni,
              },
            }
          );
        }

        if (normalizedRecurrence.enabled) {
          await ensureFutureOccurrences(parentId);
        }
      }
    } else if (
      updatedEvent?.recurrence?.enabled &&
      nextStatus === "completed"
    ) {
      await ensureFutureOccurrences(updatedEvent._id);
    } else if (
      isRecurringInstance &&
      nextStatus === "completed"
    ) {
      await ensureFutureOccurrences(seriesParentId);
    }

    const newCommitteeId = updatedEvent?.committeeId?.toString();
    if (isAdmin && oldCommitteeId !== newCommitteeId) {
      if (oldCommitteeId) {
        await Committee.findByIdAndUpdate(oldCommitteeId, { $pull: { events: event._id } });
      }
      if (newCommitteeId) {
        await Committee.findByIdAndUpdate(newCommitteeId, { $addToSet: { events: event._id } });
      }
    }

    if (updatedEvent && normalizedRecurrence) {
      (updatedEvent as any).recurrence = normalizedRecurrence;
    }

    return NextResponse.json(updatedEvent, { status: 200 });
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

    const isAdmin = member.role === "admin" || member.role === "superadmin";
    if (
      !isAdmin &&
      event.status === "completed" &&
      Array.isArray(event.attendees) &&
      event.attendees.length > 0
    ) {
      return NextResponse.json(
        { error: "Only admins can delete events with attendees" },
        { status: 403 }
      );
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
