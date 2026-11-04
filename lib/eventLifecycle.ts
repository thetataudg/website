// Event lifecycle: building a recurring series, and moving events through
// scheduled -> ongoing -> completed without anyone having to remember to.
//
// Two jobs live here because both used to be called from the same places and
// both are about "what state should the calendar be in right now":
//
//   * `syncSeriesOccurrences` materialises a recurring series in full, up to
//     its end date, in one go. It replaced a rolling window that only created
//     the next occurrence once a previous one was completed, which meant a
//     series was only ever as long as somebody's habit of ending meetings.
//   * `advanceEventLifecycle` starts events when their time arrives and closes
//     them after the grace period. It is idempotent and safe to run from
//     several places at once (the in-process scheduler, the Netlify function,
//     the cron route), which is what lets all of them stay wired up.
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import {
  MAX_RECURRENCE_OCCURRENCES,
  MAX_RECURRENCE_SPAN_DAYS,
  listRecurrenceOccurrences,
  normalizeRecurrenceEndDate,
  occurrenceDayKey,
} from "@/lib/recurrence";
import { syncEventWithCalendar, deleteCalendarEvent } from "@/lib/calendar";

/// A refusal the caller can show to whoever filled in the form. `statusCode`
/// is what `apiErrorResponse` reads to answer 400 instead of a generic 500.
export class RecurrenceError extends Error {
  statusCode = 400;
}

export type ResolvedRecurrence = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  endDate: Date | null;
  count: number;
};

/**
 * Turns the `recurrence` object a client sent into the one that is stored, or
 * throws a `RecurrenceError` saying what is wrong with it.
 *
 * Shared by create and edit so the two cannot disagree about what a valid
 * series is. `existing` is the event's current recurrence on an edit: anything
 * the client left out falls back to it, so an older build that does not know
 * about a field cannot blank it by saving.
 *
 * Rules:
 *   - A repeating event needs an end date, and it has to leave room for at
 *     least one repeat. Open-ended series are gone because the series is now
 *     generated all at once.
 *   - The series is capped (see `MAX_RECURRENCE_*`) and refused past it.
 *   - Old app builds send only `count` ("keep N upcoming") and no end date.
 *     Rejecting them would make repeating meetings unschedulable from phones
 *     that have not updated, so when a *new* series arrives with a count and no
 *     end date, the end date is worked out from the count (the first
 *     occurrence plus `count - 1` repeats) and clamped to the caps instead of
 *     refused.
 *   - A series that already exists with a count and no end date (every series
 *     created before this change) is left exactly as it is. It was generated
 *     under the old rolling rules, nothing new is generated for it, and
 *     nothing of it is deleted; saving an unrelated edit must not fail on
 *     it either.
 */
export function resolveRecurrence(
  input: any,
  startTime: Date,
  endTime: Date,
  existing?: any
): ResolvedRecurrence {
  const frequency: ResolvedRecurrence["frequency"] =
    input?.frequency === "daily" ||
    input?.frequency === "weekly" ||
    input?.frequency === "monthly"
      ? input.frequency
      : existing?.frequency || "weekly";
  const interval = Math.max(
    Number(input?.interval) || Number(existing?.interval) || 1,
    1
  );

  if (!input?.enabled) {
    return { enabled: false, frequency, interval, endDate: null, count: 1 };
  }

  const hasEndDate = input && "endDate" in input && input.endDate;
  let endDate = hasEndDate
    ? normalizeRecurrenceEndDate(input.endDate)
    : input && "endDate" in input
    ? null
    : existing?.endDate
    ? new Date(existing.endDate)
    : null;
  if (hasEndDate && !endDate) {
    throw new RecurrenceError("That repeat end date isn't a valid date.");
  }

  const wasSeries = !!existing?.enabled;
  if (!endDate && wasSeries && !existing?.endDate) {
    // Legacy series (see above): untouched.
    return {
      enabled: true,
      frequency,
      interval,
      endDate: null,
      count: Math.max(Number(existing?.count) || 1, 1),
    };
  }

  const legacyCount = Number(input?.count);
  const config = { frequency, interval };
  let derivedFromCount = false;
  if (!endDate) {
    if (!(legacyCount >= 1)) {
      throw new RecurrenceError("Choose an end date for a repeating event.");
    }
    derivedFromCount = true;
    const repeats = Math.min(Math.floor(legacyCount), MAX_RECURRENCE_OCCURRENCES) - 1;
    const farFuture = new Date(startTime.getTime() + 20 * 365 * 24 * 3600 * 1000);
    const steps = repeats > 0
      ? listRecurrenceOccurrences(startTime, endTime, { ...config, endDate: farFuture }, repeats)
      : [];
    const lastStart = steps.length ? steps[steps.length - 1].startTime : startTime;
    endDate = normalizeRecurrenceEndDate(lastStart);
    // Clamp to the span cap rather than refuse: an old build has no way to
    // show the new error properly.
    const spanLimit = normalizeRecurrenceEndDate(
      new Date(startTime.getTime() + MAX_RECURRENCE_SPAN_DAYS * 24 * 3600 * 1000)
    );
    if (endDate && spanLimit && endDate > spanLimit) endDate = spanLimit;
  }
  if (!endDate) {
    throw new RecurrenceError("Choose an end date for a repeating event.");
  }

  if (endDate.getTime() <= startTime.getTime()) {
    throw new RecurrenceError("The repeat end date has to be after the event starts.");
  }
  const spanDays = (endDate.getTime() - startTime.getTime()) / (24 * 3600 * 1000);
  if (spanDays > MAX_RECURRENCE_SPAN_DAYS) {
    throw new RecurrenceError(
      "A repeating event can run for at most one year. Choose an earlier end date."
    );
  }

  const repeats = listRecurrenceOccurrences(
    startTime,
    endTime,
    { ...config, endDate },
    MAX_RECURRENCE_OCCURRENCES + 1
  );
  if (repeats.length + 1 > MAX_RECURRENCE_OCCURRENCES) {
    throw new RecurrenceError(
      `That would create more than ${MAX_RECURRENCE_OCCURRENCES} events. Choose an earlier end date or repeat less often.`
    );
  }
  if (!repeats.length && !derivedFromCount) {
    throw new RecurrenceError("The repeat end date comes before the first repeat.");
  }

  return { enabled: true, frequency, interval, endDate, count: repeats.length + 1 };
}

/**
 * Brings a series' rows in line with its recurrence settings: every occurrence
 * up to the end date exists, and future ones that no longer belong are gone.
 *
 * Called when a series is created and when its recurrence settings are edited.
 * It is *not* called when an occurrence is completed, and nothing else creates
 * occurrences: the whole series is on the calendar from the first save.
 *
 * Creating: occurrences are matched to existing rows by Arizona calendar day,
 * and only dates *after* the series' last existing row are created. That makes
 * extending the end date add exactly the new tail, and means an occurrence an
 * officer deleted (or moved to another day) by hand is not resurrected by the
 * next settings change.
 *
 * Removing: an occurrence is deleted only if it is in the future, still
 * `scheduled`, has no attendees, and no longer falls on the series' schedule
 * (past a shortened end date, or off a changed frequency/interval). Anything
 * started, finished or attended is history and is never touched. `keepIds`
 * protects the row the officer is editing right now.
 *
 * `includePast` is true only for the initial generation, where a series that
 * begins in the past (backfilling a semester) should create its past dates too.
 */
export async function syncSeriesOccurrences(
  parentId: any,
  opts: { includePast?: boolean; keepIds?: string[] } = {}
) {
  const parent = (await Event.findById(parentId).lean()) as any;
  const endDate = parent?.recurrence?.endDate;
  // No end date means a series from before this change; see resolveRecurrence.
  if (!parent || !parent.recurrence?.enabled || !endDate) {
    return { created: 0, removed: 0 };
  }

  const wanted = listRecurrenceOccurrences(
    parent.startTime,
    parent.endTime,
    {
      frequency: parent.recurrence.frequency,
      interval: parent.recurrence.interval,
      endDate: new Date(endDate),
    },
    MAX_RECURRENCE_OCCURRENCES
  ).slice(0, MAX_RECURRENCE_OCCURRENCES - 1);
  const wantedKeys = new Set(wanted.map((o) => occurrenceDayKey(o.startTime)));

  const siblings = (await Event.find({ recurrenceParentId: parentId })
    .select("_id startTime status attendees calendarEventId")
    .lean()) as any[];

  const now = new Date();
  const keep = new Set((opts.keepIds || []).map(String));
  let removed = 0;
  const remaining: any[] = [];
  for (const evt of siblings) {
    const removable =
      new Date(evt.startTime) > now &&
      evt.status === "scheduled" &&
      !(evt.attendees?.length > 0) &&
      !keep.has(String(evt._id)) &&
      !wantedKeys.has(occurrenceDayKey(evt.startTime));
    if (!removable) {
      remaining.push(evt);
      continue;
    }
    // Conditional on the same facts again, so a check-in that lands between
    // the read above and this delete wins.
    const gone = await Event.deleteOne({
      _id: evt._id,
      status: "scheduled",
      "attendees.0": { $exists: false },
    });
    if (gone.deletedCount) {
      await deleteCalendarEvent(evt);
      removed += 1;
    } else {
      remaining.push(evt);
    }
  }

  const existingKeys = new Set(
    [parent, ...remaining].map((evt) => occurrenceDayKey(evt.startTime))
  );
  const lastExisting = Math.max(
    ...[parent, ...remaining].map((evt) => new Date(evt.startTime).getTime())
  );

  let created = 0;
  for (const next of wanted) {
    const key = occurrenceDayKey(next.startTime);
    if (next.startTime.getTime() <= lastExisting || existingKeys.has(key)) continue;
    if (!opts.includePast && next.startTime <= now) continue;

    const row = await Event.create({
      name: parent.name,
      description: parent.description,
      committeeId: parent.committeeId || null,
      startTime: next.startTime,
      endTime: next.endTime,
      startedAt: null,
      endedAt: null,
      location: parent.location,
      // The where-fields have to travel with the rest, or every generated
      // occurrence of a Zoom meeting comes out as a physical event at the
      // room name with no link.
      locationKind: parent.locationKind || "physical",
      virtualPlatform: parent.virtualPlatform ?? null,
      virtualLink: parent.virtualLink || "",
      eventType: parent.eventType,
      gemCategory: parent.gemCategory || null,
      recurrence: { enabled: false },
      status: "scheduled",
      visibleToAlumni: parent.visibleToAlumni,
      emailGroups: {
        actives: parent.emailGroups?.actives === true,
        alumni: parent.emailGroups?.alumni === true,
      },
      attendees: [],
      recurrenceParentId: parentId,
    });
    await syncEventWithCalendar(row);
    existingKeys.add(key);
    created += 1;
  }

  if (created || removed) {
    logger.info(
      { parentId: String(parentId), created, removed },
      "Recurring series reconciled"
    );
  }
  return { created, removed };
}

/// How long after an event's scheduled end it is closed on its own.
export const AUTO_COMPLETE_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Moves events through their lifecycle on the clock:
 *
 *   - `scheduled` -> `ongoing` once `startTime` arrives (and the event has not
 *     already ended), stamping `startedAt` if nothing has.
 *   - `scheduled` or `ongoing` -> `completed` two hours after `endTime`,
 *     stamping `endedAt` if nothing has.
 *
 * Somebody running the door has a queue in front of them, and remembering to
 * tap "start" and then "end check-in" is the first thing to go. An event left
 * `ongoing` keeps accepting codes indefinitely, which is how attendance ends
 * up with people who turned up the following week. `scheduled` events are
 * closed too: one that was never started is over as surely as one that was.
 *
 * Idempotent and safe to run concurrently. Each transition is a single
 * `updateMany` whose filter names the status it moves *from*, so two overlapping
 * runs (this process's scheduler and the Netlify function, say) cannot both
 * transition the same row, and the timestamps are set in the same atomic write
 * with `$ifNull` so a value an officer already recorded is never overwritten.
 *
 * Completion runs first so an event that is already long over is closed
 * directly instead of flashing through `ongoing`.
 *
 * Deliberately no push when an event auto-starts. Starting by hand sends
 * "event_started" because an officer opening the doors is a signal; the clock
 * is not. The 30-minute "starting soon" reminder already covers the heads-up,
 * and an auto-start push would fire for every occurrence of every series
 * (including ones nobody is running a door for) and double up with the manual
 * push whenever an officer taps start a minute later. `startedNotifiedAt` is
 * left unset so a later hand-start from a client that still announces on its
 * own transition is unaffected. Calendar sync is not needed either: it only
 * reflects `cancelled`.
 */
export async function advanceEventLifecycle(now = new Date()) {
  const completedResult = await Event.updateMany(
    {
      status: { $in: ["scheduled", "ongoing"] },
      endTime: { $lt: new Date(now.getTime() - AUTO_COMPLETE_GRACE_MS) },
    },
    [
      {
        $set: {
          status: "completed",
          // When the rule closed it, not "now": after an outage `now` could be
          // days late, and the deadline is the honest end of the window.
          endedAt: {
            $ifNull: ["$endedAt", { $add: ["$endTime", AUTO_COMPLETE_GRACE_MS] }],
          },
        },
      },
    ]
  );

  const startedResult = await Event.updateMany(
    {
      status: "scheduled",
      startTime: { $lte: now },
      // Over but still inside the grace window: leave it for the completion
      // pass instead of opening check-in on a finished event.
      endTime: { $gt: now },
    },
    [
      {
        $set: {
          status: "ongoing",
          startedAt: { $ifNull: ["$startedAt", now] },
        },
      },
    ]
  );

  const completed = completedResult.modifiedCount;
  const started = startedResult.modifiedCount;
  if (completed || started) {
    logger.info({ started, completed }, "Advanced event lifecycle");
  }
  return { started, completed };
}

/// Normalises the "where" half of an event body.
///
/// One helper for both routes because create and edit have to agree: a value
/// the POST accepts and the PATCH silently drops is a field that works until
/// somebody edits the event, which is the worst time to find out.
///
/// The kind is what decides the rest. Anything that is not exactly "virtual"
/// is physical, and a physical event carries no platform and no link even if
/// the client sent them, so switching an event back to a room cannot leave a
/// dead Zoom URL attached to it.
export function normalizeWhere(input: any, existing?: any) {
  const kind = input?.locationKind === "virtual" ? "virtual" : "physical";
  if (kind === "physical") {
    return { locationKind: "physical", virtualPlatform: null, virtualLink: "" };
  }
  const platforms = ["discord", "zoom", "meet", "teams", "other"];
  const sent = String(input?.virtualPlatform || "").toLowerCase();
  const platform = platforms.includes(sent)
    ? sent
    : existing?.virtualPlatform ?? null;
  // Trimmed but not validated into oblivion: an officer pasting a link with a
  // stray space around it means the link, and refusing the save over it would
  // be pedantry. The app only ever *offers* to open it when it parses.
  const link = String(input?.virtualLink ?? existing?.virtualLink ?? "").trim();
  return { locationKind: "virtual", virtualPlatform: platform, virtualLink: link };
}
