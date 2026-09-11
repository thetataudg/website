// lib/eventNotify.ts
// Telling the chapter about the calendar.
//
// Modelled on `lib/newsletterNotify.ts` and bound by the same rule: announcing
// is a courtesy laid on top of a record that already exists. The event is on
// the calendar the moment the document says so. If APNs is down, or half the
// roster has no email on file, that must not turn a successful create into a
// failed request, so nothing in here throws.
//
// Three moments, and only three. "Published" and "started" are facts an
// officer creates by acting; "starting soon" is the one the cron finds. There
// is deliberately no "ended" announcement: an event that has finished is not
// something anybody can act on, and a push about it is a buzz that asks for
// nothing.
import { DateTime } from "luxon";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { notifyMany } from "@/lib/notify";
import { eventRecipients } from "@/lib/notify/audience";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { renderTemplate } from "@/lib/notify/templates";
import type { NotifyTemplate, TemplateContext } from "@/lib/notify/templates";
import { sendGroupEmail, type ChapterGroup } from "@/lib/notify/groupEmail";
import { absoluteUrl } from "@/lib/siteUrl";

/// How far ahead the reminder goes out.
export const STARTING_SOON_LEAD_MS = 30 * 60 * 1000;

/// "tonight at 7:00 PM", "tomorrow at 9:00 AM", "Sat, Sep 5 at 6:30 PM".
///
/// Phoenix, always, and computed here rather than in the template for the same
/// reason `phoenixDayLabel` is: whether something is "tonight" is a timezone
/// question, and it gets answered once, upstream, instead of three times in
/// three renderers.
export function eventWhenLabel(start: Date | null, now = new Date()): string {
  if (!start) return "";
  const when = DateTime.fromJSDate(start).setZone(ARIZONA_ZONE);
  if (!when.isValid) return "";
  const today = DateTime.fromJSDate(now).setZone(ARIZONA_ZONE).startOf("day");
  const days = when.startOf("day").diff(today, "days").days;
  const time = when.toFormat("h:mm a");
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${when.toFormat("EEE, LLL d")} at ${time}`;
}

interface EventAnnouncement {
  event: any;
  template: NotifyTemplate;
  /// The officer who acted, for the `sentBy` stamp. Null for the cron.
  actorId?: any | null;
}

/// The groups the creator chose to email. Alumni only if they can see it.
function eventEmailGroups(event: any): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  if (event?.emailGroups?.actives === true) groups.push("actives");
  if (event?.emailGroups?.alumni === true && event?.visibleToAlumni === true) {
    groups.push("alumni");
  }
  return groups;
}

/// One email to the chosen groups, for creation and the 30 minute warning.
/// "Started" is push only: it lands 30 minutes after the warning already did.
async function emailEventGroups(
  event: any,
  template: NotifyTemplate,
  context: Partial<TemplateContext>
): Promise<void> {
  if (template !== "event_published" && template !== "event_starting_soon") return;
  const groups = eventEmailGroups(event);
  if (!groups.length) return;
  const message = renderTemplate(template, { ...context, amountCents: 0 } as TemplateContext);
  await sendGroupEmail({
    groups,
    category: "events",
    subject: message.emailSubject,
    content: {
      eyebrow: template === "event_published" ? "New event" : "Starting soon",
      title: message.title,
      paragraphs: [message.body],
      ctaLabel: "Open the event",
      ctaHref: absoluteUrl(message.link),
      preheader: message.push,
    },
    idempotencyKey: `${template}/${String(event?._id || "")}`,
  });
}

/// One event, one moment, everybody who can see it.
async function announceEvent(input: EventAnnouncement): Promise<number> {
  const { event, template, actorId } = input;
  try {
    await emailEventGroups(event, template, {
      eventName: String(event?.name || "").trim(),
      eventWhen: eventWhenLabel(event?.startTime ? new Date(event.startTime) : null),
      eventLocation: String(event?.location || "").trim(),
      eventId: String(event?._id || ""),
    });

    // `visibleToAlumni` defaults true on the schema, but an event created
    // before that field existed has no value at all. Reading a missing flag as
    // "alumni too" would quietly widen every legacy event's audience, so the
    // absent case resolves to actives only.
    const openToAlumni = event?.visibleToAlumni === true;
    const recipients = await eventRecipients(openToAlumni);
    if (!recipients.length) {
      logger.warn({ eventId: String(event?._id) }, "No recipients for event announcement");
      return 0;
    }

    const context: Partial<TemplateContext> = {
      eventName: String(event?.name || "").trim(),
      eventWhen: eventWhenLabel(event?.startTime ? new Date(event.startTime) : null),
      eventLocation: String(event?.location || "").trim(),
      eventId: String(event?._id || ""),
    };

    const report = await notifyMany(
      recipients.map((recipient) => ({
        recipient,
        template,
        context: {
          ...context,
          firstName: recipient.firstName,
          amountCents: 0,
        } as TemplateContext,
        sentBy: actorId ?? null,
        // Nobody's ledger moved. A finance event stamped onto a member for a
        // calendar entry would put a chapter meeting in their payment history.
        audit: false,
        // Members get the push, which opens the event in the app or on the
        // site. Email goes once to the chosen groups instead of once per
        // member, which had used up the whole Resend budget.
        channels: ["push"],
        // Thirty minutes of warning is only useful if it arrives through a
        // Focus mode, which is exactly the case Apple reserves this level for.
        timeSensitive: template === "event_starting_soon",
      }))
    );

    logger.info(
      {
        eventId: String(event?._id),
        template,
        recipients: recipients.length,
        sent: report?.sentCount ?? 0,
        alumni: openToAlumni,
      },
      "Event announced"
    );
    return report?.sentCount ?? 0;
  } catch (err: any) {
    logger.error({ err, eventId: String(event?._id), template }, "Failed to announce event");
    return 0;
  }
}

/// A new event landed on the calendar.
///
/// The guard is claimed with a conditional update rather than a read followed
/// by a write: two officers saving the same recurring series at once would
/// both read null and both announce otherwise.
export async function announceEventPublished(
  event: any,
  actorId?: any | null
): Promise<number> {
  if (!event?._id) return 0;
  // A cancelled event is not news, and neither is one created in the past,
  // which is how attendance gets backfilled after the fact.
  if (event.status === "cancelled") return 0;
  const start = event.startTime ? new Date(event.startTime) : null;
  if (!start || start.getTime() <= Date.now()) return 0;

  const claimed = await Event.updateOne(
    { _id: event._id, publishedNotifiedAt: null },
    { $set: { publishedNotifiedAt: new Date() } }
  );
  if (!claimed.modifiedCount) return 0;

  return announceEvent({ event, template: "event_published", actorId });
}

/// An officer flipped the event to ongoing.
export async function announceEventStarted(
  event: any,
  actorId?: any | null
): Promise<number> {
  if (!event?._id) return 0;

  const claimed = await Event.updateOne(
    { _id: event._id, startedNotifiedAt: null },
    { $set: { startedNotifiedAt: new Date() } }
  );
  if (!claimed.modifiedCount) return 0;

  return announceEvent({ event, template: "event_started", actorId });
}

/// The half-hour warning, for every event about to begin.
///
/// Rides the ten-minute calendar sync rather than taking a schedule of its
/// own, which means the notice actually goes out somewhere between twenty and
/// thirty minutes ahead. That imprecision is deliberate: a tighter promise
/// would need a per-event timer, and "starts in about 30 minutes" is honest
/// about the window it is sent in.
export async function remindUpcomingEvents(now = new Date()): Promise<{
  reminded: number;
  events: number;
}> {
  const horizon = new Date(now.getTime() + STARTING_SOON_LEAD_MS);
  let reminded = 0;
  let announced = 0;

  try {
    const due = await Event.find({
      startingSoonNotifiedAt: null,
      status: { $in: ["scheduled", "ongoing"] },
      // Already inside the window, but not yet begun. The lower bound matters:
      // without it, an event created three weeks late would be swept up and
      // announced as "starting in 30 minutes" long after it finished.
      startTime: { $gt: now, $lte: horizon },
    }).lean<any[]>();

    for (const event of due) {
      const claimed = await Event.updateOne(
        { _id: event._id, startingSoonNotifiedAt: null },
        { $set: { startingSoonNotifiedAt: new Date() } }
      );
      if (!claimed.modifiedCount) continue;
      reminded += await announceEvent({
        event,
        template: "event_starting_soon",
        actorId: null,
      });
      announced += 1;
    }
  } catch (err: any) {
    logger.error({ err }, "Failed to sweep events starting soon");
  }

  return { reminded, events: announced };
}
