// lib/events/createEvent.ts
// The one place an `Event` is born.
//
// This was the tail of `POST /api/events`: build the doc, save it (with the
// non-committee save quirk), repair the fields Mongoose's cast drops, link it
// to its committee, generate the recurring series, sync it to Google Calendar,
// and announce it. `POST /api/availability/[id]/schedule` has to do the exact
// same thing when a poll turns into a real meeting, so it lives here and both
// routes call it. Two implementations of this would drift, and the drift would
// be "the poll made an event that never synced to the calendar".
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { syncEventWithCalendar } from "@/lib/calendar";
import {
  RecurrenceError,
  resolveRecurrence,
  syncSeriesOccurrences,
  normalizeWhere,
} from "@/lib/eventLifecycle";
import { announceEventPublished } from "@/lib/eventNotify";
import { normalizeGemCategory } from "@/lib/gem";
import { checkEventScopeAccess } from "@/lib/eventAuth";

export interface CreateEventInput {
  name: string;
  description?: string;
  committeeId?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  location?: string;
  locationKind?: "physical" | "virtual";
  virtualPlatform?: string | null;
  virtualLink?: string;
  eventType?: string;
  gemCategory?: string | null;
  status?: string;
  visibleToAlumni?: boolean;
  /// Which chapter groups get an email about this event. Both off unless the
  /// creator turns them on.
  emailGroups?: { actives?: boolean; alumni?: boolean } | null;
  recurrence?: {
    enabled?: boolean;
    frequency?: string;
    interval?: number;
    endDate?: string | Date | null;
    count?: number;
  } | null;
  /// Who is doing this, for the announcement's "posted by" line. Null for a
  /// cron.
  actorId?: any | null;
  /// Skip `announceEventPublished`. Defaults to announcing — the poll wants the
  /// same "new event on the calendar" push everyone else gets.
  announce?: boolean;
}

export async function createEvent(input: CreateEventInput) {
  const committeeId = input.committeeId || null;

  const normalizedEventType =
    input.eventType === "meeting" ||
    input.eventType === "chapter" ||
    input.eventType === "event"
      ? input.eventType
      : "event";
  const normalizedGemCategory = normalizeGemCategory(input.gemCategory);
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    endTime <= startTime
  ) {
    // Same 400 shape as a refused series, so callers already turn it into a
    // message the person can act on.
    throw new RecurrenceError("The event has to end after it starts.");
  }
  // Validated before anything is written, so a refused series leaves no
  // half-created parent behind.
  const normalizedRecurrence = resolveRecurrence(
    input.recurrence,
    startTime,
    endTime
  );
  const where = normalizeWhere(input);
  const visibleToAlumni = input.visibleToAlumni ?? true;
  // Alumni can't be emailed about an event they can't see.
  const emailGroups = {
    actives: input.emailGroups?.actives === true,
    alumni: input.emailGroups?.alumni === true && visibleToAlumni,
  };

  const eventDoc = {
    name: input.name.trim(),
    description: input.description ?? "",
    committeeId,
    startTime,
    endTime,
    startedAt: null,
    endedAt: null,
    location: input.location ?? "",
    eventType: normalizedEventType,
    gemCategory: normalizedGemCategory,
    recurrence: normalizedRecurrence,
    status: input.status ?? "scheduled",
    visibleToAlumni,
    emailGroups,
    ...where,
    attendees: [],
  };

  let event: any;
  if (!committeeId) {
    const created = new Event(eventDoc);
    await created.save({ validateBeforeSave: false });
    event = created.toObject();
  } else {
    event = await Event.create(eventDoc);
  }

  // Mongoose's cast quietly drops these when the compiled schema is stale on a
  // dev hot reload; write them straight through so a create is never partial.
  if (event?._id) {
    await Event.collection.updateOne(
      { _id: event._id },
      {
        $set: {
          eventType: normalizedEventType,
          recurrence: normalizedRecurrence,
          gemCategory: normalizedGemCategory,
          emailGroups,
        },
      }
    );
    event.recurrence = normalizedRecurrence;
    event.emailGroups = emailGroups;
  }

  if (committeeId) {
    await Committee.findByIdAndUpdate(committeeId, {
      $addToSet: { events: event._id },
    });
  }

  // The whole series up to its end date, now. Nothing generates more later;
  // completing an occurrence no longer pulls the next one onto the calendar.
  if (normalizedRecurrence.enabled && event?._id) {
    await syncSeriesOccurrences(event._id, { includePast: true });
  }

  if (event) {
    const syncResult = await syncEventWithCalendar(event);
    if (syncResult.calendarEventId) {
      event.calendarEventId = syncResult.calendarEventId;
    }
  }

  if (input.announce !== false) {
    // Not awaited, exactly as the route did it: a create must not sit behind
    // sixty pushes, and `announceEventPublished` swallows its own failures.
    void announceEventPublished(event, input.actorId ?? null);
  }

  logger.info({ eventId: event?._id }, "Event created");
  return event;
}

/// Create an event as `member`: the scope check the website's POST does, then
/// `createEvent`. Shared by `POST /api/events` and the MCP `create_event` tool
/// so the two cannot disagree about who may put what on whose calendar.
///
/// `input.actorId` is ignored; the member is the actor.
export async function createEventAs(
  member: { _id: any; role?: string | null; isECouncil?: boolean | null },
  input: Omit<CreateEventInput, "actorId">
): Promise<
  | { ok: true; value: any }
  | { ok: false; status: number; error: string }
> {
  const access = await checkEventScopeAccess(member, input.committeeId);
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }
  const event = await createEvent({ ...input, actorId: member?._id ?? null });
  return { ok: true, value: event };
}
