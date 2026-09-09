// lib/availability/service.ts
// The operations behind the availability API that are worth keeping out of the
// route handlers: working out the audience, opening a poll, and turning a
// chosen slot into a real chapter Event.
import { DateTime } from "luxon";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { createEvent } from "@/lib/events/createEvent";
import { chapterRecipients } from "@/lib/notify/audience";
import { notify, recipientFor } from "@/lib/notify";
import type { TemplateContext } from "@/lib/notify/templates";
import {
  announcePollOpened,
  NAG_CHANNELS,
  pollAccentColor,
  pollPath,
} from "@/lib/availability/remind";
import { uniquePollSlug } from "@/lib/availability/slug";
import { eventWhenLabel } from "@/lib/eventNotify";

const SLOT_MINUTES = [15, 30, 60];

export interface CreatePollInput {
  title: string;
  description?: string;
  committeeId?: string | null;
  /// "dates" (default) or "weekdays".
  dateMode?: string;
  dates: string[];
  /// 1..7 (Mon..Sun) when dateMode === "weekdays".
  weekdays?: number[];
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
  meetingMinutes: number;
  deadline: string | Date;
  reminder?: {
    cadenceHours?: number;
    escalateToHead?: boolean;
    finalCallHours?: number;
    maxReminders?: number;
  };
  /// The head can uncheck people the auto-roster included, or add extras.
  inviteeIds?: string[];
  /// Skip the auto-roster entirely and use `inviteeIds` verbatim.
  inviteesExact?: boolean;
}

/// The people a poll asks by default: the committee's head and roster, or —
/// for a chapter-wide poll — every active member. The head's `inviteeIds` /
/// `inviteesExact` then trim or replace that set.
export async function resolveInvitees(
  input: Pick<CreatePollInput, "committeeId" | "inviteeIds" | "inviteesExact">
): Promise<string[]> {
  if (input.inviteesExact && input.inviteeIds) {
    return [...new Set(input.inviteeIds.map(String))];
  }

  let base: string[] = [];
  if (input.committeeId) {
    const committee = await Committee.findById(input.committeeId)
      .select("committeeHeadId committeeMembers")
      .lean<any>();
    if (committee) {
      base = [
        ...(committee.committeeHeadId ? [String(committee.committeeHeadId)] : []),
        ...(committee.committeeMembers || []).map(String),
      ];
    }
  } else {
    const everyone = await chapterRecipients();
    base = everyone.map((r) => String(r.memberId));
  }

  const set = new Set(base);
  if (input.inviteeIds) {
    // When both are given, `inviteeIds` is the explicit keep-list: intersect,
    // then union in anyone extra the head named.
    const wanted = new Set(input.inviteeIds.map(String));
    for (const id of set) if (!wanted.has(id)) set.delete(id);
    for (const id of wanted) set.add(id);
  }
  return [...set];
}

function normalizeReminder(reminder: CreatePollInput["reminder"]) {
  return {
    cadenceHours: Math.max(Number(reminder?.cadenceHours) || 24, 1),
    escalateToHead: reminder?.escalateToHead !== false,
    finalCallHours: Math.max(Number(reminder?.finalCallHours) || 24, 1),
    maxReminders: Math.max(Number(reminder?.maxReminders) || 5, 1),
  };
}

/// Validates the grid, opens the poll, and fires the first ask. Throws a plain
/// Error with a message the route turns into a 400.
export async function createAvailabilityPoll(
  input: CreatePollInput,
  createdBy: any
) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("A title is required");

  const dateMode = input.dateMode === "weekdays" ? "weekdays" : "dates";

  let dates: string[] = [];
  let weekdays: number[] = [];
  if (dateMode === "weekdays") {
    weekdays = [
      ...new Set(
        (input.weekdays || [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
      ),
    ].sort((a, b) => a - b);
    if (!weekdays.length) throw new Error("Pick at least one day of the week");
  } else {
    dates = [...new Set((input.dates || []).map(String))]
      .filter((d) => DateTime.fromISO(d, { zone: ARIZONA_ZONE }).isValid)
      .sort();
    if (!dates.length) throw new Error("Pick at least one date");
    if (dates.length > 31) throw new Error("That is more than a month of dates");
  }

  const dayStartMinute = Math.max(0, Math.min(1440, Number(input.dayStartMinute)));
  const dayEndMinute = Math.max(0, Math.min(1440, Number(input.dayEndMinute)));
  if (!(dayEndMinute > dayStartMinute)) {
    throw new Error("The daily window ends before it starts");
  }
  const slotMinutes = SLOT_MINUTES.includes(Number(input.slotMinutes))
    ? Number(input.slotMinutes)
    : 30;
  const meetingMinutes = Math.max(Number(input.meetingMinutes) || slotMinutes, slotMinutes);
  if (meetingMinutes > dayEndMinute - dayStartMinute) {
    throw new Error("The meeting is longer than the daily window");
  }

  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime())) throw new Error("The deadline is not a date");
  if (deadline.getTime() <= Date.now()) throw new Error("The deadline is in the past");

  const inviteeIds = await resolveInvitees(input);
  if (!inviteeIds.length) throw new Error("That poll has nobody to ask");

  const now = new Date();
  const slug = await uniquePollSlug(title, input.committeeId || null);
  const poll = await AvailabilityPoll.create({
    title,
    slug,
    description: String(input.description || "").trim(),
    createdBy,
    committeeId: input.committeeId || null,
    status: "open",
    dateMode,
    dates,
    weekdays,
    dayStartMinute,
    dayEndMinute,
    slotMinutes,
    meetingMinutes,
    deadline,
    reminder: normalizeReminder(input.reminder),
    invitees: inviteeIds.map((memberId) => ({ memberId, addedAt: now })),
    responses: [],
    reminderState: [],
  });

  // Fire the first ask, then re-read so the caller sees the seeded
  // reminderState.
  await announcePollOpened(poll.toObject(), now).catch((err) =>
    logger.warn({ err, pollId: String(poll._id) }, "Poll opened but the first ask failed")
  );
  return AvailabilityPoll.findById(poll._id).lean();
}

export interface ScheduleInput {
  /// Phoenix wall-clock ISO from the ranked slot.
  startISO: string;
  endISO: string;
  location?: string;
  locationKind?: "physical" | "virtual";
  virtualPlatform?: string | null;
  virtualLink?: string;
  eventType?: string;
  gemCategory?: string | null;
  recurrence?: {
    enabled?: boolean;
    frequency?: string;
    interval?: number;
    endDate?: string | Date | null;
    count?: number;
  } | null;
}

/// Turn the chosen slot into the chapter's own Event, mark the poll scheduled,
/// and tell the invitees it is closed. Everything the normal event-create path
/// does (calendar sync, ICS, the published push) rides along because it goes
/// through the same `createEvent`.
export async function scheduleFromPoll(
  poll: any,
  input: ScheduleInput,
  actorId: any
) {
  if (poll.status === "scheduled" && poll.scheduledEventId) {
    throw new Error("This poll already has an event");
  }
  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("That time slot is not valid");
  }

  const event = await createEvent({
    name: poll.title,
    description: poll.description || "",
    committeeId: poll.committeeId || null,
    startTime: start,
    endTime: end,
    location: input.location ?? "",
    locationKind: input.locationKind,
    virtualPlatform: input.virtualPlatform,
    virtualLink: input.virtualLink,
    eventType: input.eventType || "meeting",
    gemCategory: input.gemCategory ?? null,
    recurrence: input.recurrence ?? null,
    actorId,
  });

  await AvailabilityPoll.updateOne(
    { _id: poll._id },
    { $set: { status: "scheduled", scheduledEventId: event._id } }
  );

  const when = eventWhenLabel(start);
  const accentColor = await pollAccentColor(poll);
  const context: Partial<TemplateContext> = {
    pollId: String(poll._id),
    pollPath: pollPath(poll),
    pollTitle: String(poll.title || "").trim() || "The meeting poll",
    eventId: String(event._id),
    eventWhen: when,
    amountCents: 0,
  };
  for (const invitee of poll.invitees || []) {
    const recipient = await recipientFor(invitee.memberId);
    if (!recipient) continue;
    await notify({
      recipient,
      template: "availability_closed",
      context: { ...context, firstName: recipient.firstName } as TemplateContext,
      sentBy: actorId,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
    }).catch(() => undefined);
  }

  logger.info(
    { pollId: String(poll._id), eventId: String(event._id) },
    "Availability poll scheduled into an event"
  );
  return event;
}
