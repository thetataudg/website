// Event lifecycle: keeping a recurring series topped up, and closing events
// that nobody remembered to close.
//
// `ensureFutureOccurrences` used to live, character for character, in both
// `app/api/events/route.ts` and `app/api/events/[id]/route.ts`. The scheduled
// sweep below needs it too, and three copies of the same generator is two too
// many.
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { addRecurrence, getArizonaNow, toArizonaDateTime } from "@/lib/recurrence";
import { syncEventWithCalendar } from "@/lib/calendar";

/**
 * Tops a recurring series back up to its configured count of *future*
 * occurrences, creating whatever is missing and syncing each to the calendar.
 *
 * The count is a rolling window rather than a total: a weekly meeting set to 4
 * always has four upcoming ones on the calendar, and gains another as each
 * passes.
 */
export async function ensureFutureOccurrences(parentId: any) {
  const parent = (await Event.findById(parentId).lean()) as any;
  if (!parent || !parent.recurrence?.enabled) return;

  const count = Math.max(Number(parent.recurrence?.count) || 1, 1);
  const now = getArizonaNow();

  const existing = await Event.find({
    $or: [{ _id: parentId }, { recurrenceParentId: parentId }],
  })
    .sort({ startTime: 1 })
    .lean();

  const future = existing.filter((evt: any) => {
    const eventStart = toArizonaDateTime(evt.startTime);
    return eventStart ? eventStart >= now : false;
  });
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
      eventType: parent.eventType,
      gemCategory: parent.gemCategory || null,
      recurrence: { enabled: false },
      status: "scheduled",
      visibleToAlumni: parent.visibleToAlumni,
      attendees: [],
      recurrenceParentId: parentId,
    });
    await syncEventWithCalendar(created);
    last = created.toObject();
    toCreate -= 1;
  }
}

/** How long after an event's scheduled end it is closed on its own. */
export const AUTO_COMPLETE_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Closes events that ran past their end time and were never ended by hand.
 *
 * Somebody running the door has a queue in front of them, and remembering to
 * come back and tap "end check-in" is the first thing to go. An event left
 * `ongoing` keeps accepting codes indefinitely, which is how attendance ends
 * up with people who turned up the following week — so three hours after the
 * scheduled end, it closes itself.
 *
 * `scheduled` events are swept too: one that was never started is over as
 * surely as one that was, and leaving it open forever means it shows as
 * startable months later.
 */
export async function autoCompleteStaleEvents() {
  const cutoff = new Date(Date.now() - AUTO_COMPLETE_GRACE_MS);

  const stale = await Event.find({
    status: { $in: ["scheduled", "ongoing"] },
    endTime: { $lt: cutoff },
  })
    .select("_id status recurrence recurrenceParentId endedAt")
    .lean<any[]>();
  if (!stale.length) return { completed: 0 };

  const now = new Date();
  await Event.updateMany(
    { _id: { $in: stale.map((event) => event._id) } },
    { $set: { status: "completed" } }
  );
  // `endedAt` is when it actually stopped, so it is only stamped on events
  // that don't already carry one.
  await Event.updateMany(
    { _id: { $in: stale.map((event) => event._id) }, endedAt: null },
    { $set: { endedAt: now } }
  );

  // Completing an occurrence is what pulls the next one onto the calendar, the
  // same way ending it by hand does.
  for (const event of stale) {
    const parentId = event.recurrenceParentId || event._id;
    await ensureFutureOccurrences(parentId);
  }

  logger.info({ completed: stale.length }, "Auto-completed events past their end time");
  return { completed: stale.length };
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
