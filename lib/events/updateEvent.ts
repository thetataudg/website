// lib/events/updateEvent.ts
// Editing and deleting an event, as one actor, with every side effect the site
// has.
//
// This was the body of `PATCH` and `DELETE /api/events/[id]`. The MCP server
// (`lib/mcp`) has to do exactly the same things (an event started by an agent
// must announce itself, sync the calendar and reconcile its series the way a
// tap on the website does), and a second copy of a 250-line edit would be the
// copy that drifts. The routes now call these; the permission rules still
// come from `lib/events/permissions.ts`.
//
// They return a result instead of a `NextResponse` so the route can map a
// refusal to its status and the MCP tools can turn it into error text. A bad
// input that used to throw (a `RecurrenceError`, a Mongoose `CastError`) still
// throws, and the caller's `apiErrorResponse` or the tool wrapper handles it.
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import { applyTimeOfDay } from "@/lib/recurrence";
import { syncEventWithCalendar, deleteCalendarEvent } from "@/lib/calendar";
import {
  normalizeWhere,
  resolveRecurrence,
  syncSeriesOccurrences,
} from "@/lib/eventLifecycle";
import { announceEventStarted } from "@/lib/eventNotify";
import { normalizeGemCategory } from "@/lib/gem";
import { resolveEventAccess } from "@/lib/events/permissions";

export type EventActionResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

async function canManageEvent(member: any, event: any) {
  return (await resolveEventAccess(member, event)).canManage;
}

/// `member` is the acting Member (lean or document). `updates` is the PATCH
/// body: the same fields the website sends.
export async function updateEventAs(
  member: any,
  eventId: string,
  updates: any
): Promise<EventActionResult<any>> {
  const event = await Event.findById(eventId);
  if (!event) {
    return { ok: false, status: 404, error: "Event not found" };
  }

  const isAdmin = member.role === "admin" || member.role === "superadmin";
  if (!(await canManageEvent(member, event))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  // Refuse a change, not the key: a client that echoes the event back with
  // its own committee untouched is not trying to move it.
  const sentCommittee = updates.committeeId ? String(updates.committeeId) : null;
  const currentCommittee = event.committeeId ? event.committeeId.toString() : null;
  if ("committeeId" in updates && !isAdmin && sentCommittee !== currentCommittee) {
    return { ok: false, status: 403, error: "Only admins can change committeeId" };
  }
  if (!isAdmin && "committeeId" in updates) delete updates.committeeId;

  const nextStart = updates.startTime ? new Date(updates.startTime) : event.startTime;
  const nextEnd = updates.endTime ? new Date(updates.endTime) : event.endTime;
  if (
    Number.isNaN(new Date(nextStart).getTime()) ||
    Number.isNaN(new Date(nextEnd).getTime()) ||
    new Date(nextEnd) <= new Date(nextStart)
  ) {
    return { ok: false, status: 400, error: "The event has to end after it starts." };
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

  const isRecurringInstance = !!event.recurrenceParentId;
  const seriesParentId = isRecurringInstance ? event.recurrenceParentId : null;

  // Recurrence settings belong to the series parent. An occurrence's own
  // form shows "repeat" as off (its stored recurrence is `{enabled: false}`),
  // and letting that reach the parent on a "whole series" save would switch
  // the series off, so settings sent while editing an occurrence are
  // ignored. Change the end date or frequency from the parent.
  //
  // Validated here, before anything is written, so a refusal ("choose an end
  // date", "that's too many events") leaves the event untouched.
  const editsRecurrence = !!updates.recurrence && !isRecurringInstance;
  const normalizedRecurrence: any = editsRecurrence
    ? resolveRecurrence(
        updates.recurrence,
        updates.startTime ? new Date(updates.startTime) : event.startTime,
        updates.endTime ? new Date(updates.endTime) : event.endTime,
        (event as any).recurrence
      )
    : (event as any).recurrence;
  const previousRecurrence: any = (event as any).recurrence;
  // Only a change to the schedule itself regenerates anything. Reconciling on
  // every save would put back an occurrence an officer had deliberately
  // deleted the next time anyone fixed a typo in the title.
  const recurrenceChanged =
    editsRecurrence &&
    !!normalizedRecurrence?.enabled &&
    !!normalizedRecurrence?.endDate &&
    (!previousRecurrence?.enabled ||
      previousRecurrence.frequency !== normalizedRecurrence.frequency ||
      Number(previousRecurrence.interval) !== normalizedRecurrence.interval ||
      new Date(previousRecurrence.endDate || 0).getTime() !==
        normalizedRecurrence.endDate.getTime());

  const requestedGemCategory =
    updates.gemCategory === undefined ? event.gemCategory : updates.gemCategory;
  const normalizedGemCategory = normalizeGemCategory(requestedGemCategory);

  const updatesToApply: any = {
    name: updates.name ?? event.name,
    description: updates.description ?? event.description,
    startTime: updates.startTime ? new Date(updates.startTime) : event.startTime,
    endTime: updates.endTime ? new Date(updates.endTime) : event.endTime,
    location: updates.location ?? event.location,
    gemCategory: normalizedGemCategory,
    eventType: normalizedEventType,
    recurrence: normalizedRecurrence,
    status: nextStatus,
    visibleToAlumni:
      typeof updates.visibleToAlumni === "boolean"
        ? updates.visibleToAlumni
        : event.visibleToAlumni,
    // `??` here meant an admin could move an event *between* committees but
    // never back to chapter-wide, because an explicit null fell through to
    // the existing value. Presence of the key is the signal.
    committeeId: "committeeId" in updates ? updates.committeeId : event.committeeId,
    // Only when the client said something about it. An older build that does
    // not know these fields exist must not blank them on every save.
    ...("locationKind" in updates ? normalizeWhere(updates, event) : {}),
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
          recurrence: normalizedRecurrence,
          gemCategory: normalizedGemCategory,
        },
      }
    );
  }

  // After the parent row carries its new settings, bring the series in line:
  // extending the end date adds the missing tail, shortening it removes
  // future occurrences nobody has started or attended. A series that has just
  // been switched on also gets its past dates (backfilling a semester).
  if (recurrenceChanged && updatedEvent?._id) {
    await syncSeriesOccurrences(updatedEvent._id, {
      includePast: !previousRecurrence?.enabled,
      keepIds: [String(updatedEvent._id)],
    });
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
              gemCategory: normalizedGemCategory,
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
              gemCategory: normalizedGemCategory,
              visibleToAlumni:
                typeof updates.visibleToAlumni === "boolean"
                  ? updates.visibleToAlumni
                  : parent.visibleToAlumni,
            },
          }
        );
      }

      const refreshedInstances = await Event.find({
        recurrenceParentId: parentId,
        startTime: { $gte: new Date() },
      });
      for (const instance of refreshedInstances) {
        await syncEventWithCalendar(instance);
      }

      const refreshedParent = await Event.findById(parentId);
      if (refreshedParent) {
        await syncEventWithCalendar(refreshedParent);
      }
    }
  }
  // Completing an occurrence used to pull the next one onto the calendar.
  // The series is generated in full when it is saved, so ending one has no
  // effect on the others.

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

  if (updatedEvent) {
    await syncEventWithCalendar(updatedEvent);
  }

  // Gated on the *transition*, not on the resulting state: every later save
  // of an event that is already ongoing would otherwise re-announce it. The
  // guard column makes a second send impossible anyway, but a route that
  // relies on the guard to be correct is one schema change away from
  // buzzing the roster on every edit.
  if (updatedEvent && nextStatus === "ongoing" && event.status !== "ongoing") {
    void announceEventStarted(updatedEvent, member?._id ?? null);
  }

  // The caller's rights over the event as it is now: a save that completed
  // an event with attendees has just taken delete away from a head.
  const access = await resolveEventAccess(member, updatedEvent);
  return {
    ok: true,
    value: { ...(updatedEvent?.toObject?.() ?? updatedEvent), ...access },
  };
}

/// DELETE. Same rules as the route: a manager may delete, but only an admin
/// may delete a completed event that has a roll attached.
export async function deleteEventAs(
  member: any,
  eventId: string
): Promise<EventActionResult<{ status: "deleted" }>> {
  const event = await Event.findById(eventId);
  if (!event) {
    return { ok: false, status: 404, error: "Event not found" };
  }

  if (!(await canManageEvent(member, event))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const isAdmin = member.role === "admin" || member.role === "superadmin";
  if (
    !isAdmin &&
    event.status === "completed" &&
    Array.isArray(event.attendees) &&
    event.attendees.length > 0
  ) {
    return {
      ok: false,
      status: 403,
      error: "Only admins can delete events with attendees",
    };
  }

  await deleteCalendarEvent(event);
  await Event.deleteOne({ _id: event._id });
  await Committee.findByIdAndUpdate(event.committeeId, {
    $pull: { events: event._id },
  });

  return { ok: true, value: { status: "deleted" } };
}
