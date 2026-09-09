// lib/events/createEvent.ts
// The one place an `Event` is born.
//
// This was the tail of `POST /api/events`: build the doc, save it (with the
// non-committee save quirk), repair the fields Mongoose's cast drops, link it
// to its committee, top up the recurring series, sync it to Google Calendar,
// and announce it. `POST /api/availability/[id]/schedule` has to do the exact
// same thing when a poll turns into a real meeting, so it lives here and both
// routes call it. Two implementations of this would drift, and the drift would
// be "the poll made an event that never synced to the calendar".
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { syncEventWithCalendar } from "@/lib/calendar";
import { ensureFutureOccurrences, normalizeWhere } from "@/lib/eventLifecycle";
import { announceEventPublished } from "@/lib/eventNotify";
import { normalizeGemCategory } from "@/lib/gem";

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

function normalizeRecurrence(recurrence: CreateEventInput["recurrence"]) {
  return {
    enabled: !!recurrence?.enabled,
    frequency:
      recurrence?.frequency === "daily" ||
      recurrence?.frequency === "weekly" ||
      recurrence?.frequency === "monthly"
        ? recurrence.frequency
        : "weekly",
    interval: Number(recurrence?.interval) || 1,
    endDate: recurrence?.endDate ? new Date(recurrence.endDate) : null,
    count: Math.max(Number(recurrence?.count) || 1, 1),
  };
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
  const normalizedRecurrence = normalizeRecurrence(input.recurrence);
  const where = normalizeWhere(input);

  const eventDoc = {
    name: input.name.trim(),
    description: input.description ?? "",
    committeeId,
    startTime: new Date(input.startTime),
    endTime: new Date(input.endTime),
    startedAt: null,
    endedAt: null,
    location: input.location ?? "",
    eventType: normalizedEventType,
    gemCategory: normalizedGemCategory,
    recurrence: normalizedRecurrence,
    status: input.status ?? "scheduled",
    visibleToAlumni: input.visibleToAlumni ?? true,
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
        },
      }
    );
    event.recurrence = normalizedRecurrence;
  }

  if (committeeId) {
    await Committee.findByIdAndUpdate(committeeId, {
      $addToSet: { events: event._id },
    });
  }

  if (normalizedRecurrence.enabled && event?._id) {
    await ensureFutureOccurrences(event._id);
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
