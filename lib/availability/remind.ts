// lib/availability/remind.ts
// The nag, and the one gate that keeps it honest.
//
// notify()'s global cooldown is keyed on (memberId, template) only, so two
// open polls chasing the same person would mute each other. The availability
// templates are registered as transactional to bypass that cooldown, and the
// real cadence is owned here, per poll, in `poll.reminderState`.
//
// Both the hourly cron and the head's manual "Remind everyone" button call
// `remindNonResponders`, so a head mashing the button four times still sends
// one nudge per person per `cadenceHours` — the same guarantee the global
// cooldown gives, just keyed on the poll instead of the template.
import mongoose from "mongoose";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { notify, notifyQuietly, recipientFor } from "@/lib/notify";
import { eventWhenLabel } from "@/lib/eventNotify";
import {
  CHAPTER_SWATCH,
  swatchForId,
  swatchForKey,
} from "@/lib/calendarColors";
import type { TemplateContext } from "@/lib/notify/templates";

type PollDoc = any;

/// Availability nags go out on every external channel, Discord DM included.
/// Naming them explicitly is also what opts Discord in for these sends without
/// turning it on for dues and votes. See lib/notify/channels/discord.ts.
export const NAG_CHANNELS = ["email", "push", "discord"];

/// The poll's accent, as a `#RRGGBB` hex: its committee's calendar colour, or
/// chapter crimson for a chapter-wide poll. Feeds the Discord embed stripe and
/// the grid tint so a poll reads as the committee it belongs to.
export async function pollAccentColor(poll: PollDoc): Promise<string> {
  if (!poll.committeeId) return CHAPTER_SWATCH.light;
  const committee = await Committee.findById(poll.committeeId)
    .select("color")
    .lean<any>();
  const swatch =
    swatchForKey(committee?.color) ?? swatchForId(String(poll.committeeId));
  return swatch.light;
}

/// The poll's grid lives inside its committee's dashboard. A chapter-wide poll
/// sits at the committees root. `sub` appends, e.g. "results" for the head
/// view.
export function pollPath(poll: PollDoc, sub?: string): string {
  const base = poll.committeeId
    ? `/member/committees/${poll.committeeId}/polls/${poll._id}`
    : `/member/committees/polls/${poll._id}`;
  return sub ? `${base}/${sub}` : base;
}

/// Who still owes an answer. A `prefill` response is seeded from their RSVPs
/// and the calendar and does not count as them having looked, so they stay on
/// the chase list until it turns `manual`.
export function outstandingInviteeIds(poll: PollDoc): string[] {
  const answered = new Set(
    (poll.responses || [])
      .filter((r: any) => r.source !== "prefill")
      .map((r: any) => String(r.memberId))
  );
  return (poll.invitees || [])
    .map((i: any) => String(i.memberId))
    .filter((id: string) => !answered.has(id));
}

/// The people who run this poll: whoever created it, plus the committee head
/// if it is a committee poll. Deduplicated.
export async function pollManagerIds(poll: PollDoc): Promise<string[]> {
  const ids = new Set<string>();
  if (poll.createdBy) ids.add(String(poll.createdBy));
  if (poll.committeeId) {
    const committee = await Committee.findById(poll.committeeId)
      .select("committeeHeadId")
      .lean<any>();
    if (committee?.committeeHeadId) ids.add(String(committee.committeeHeadId));
  }
  return [...ids];
}

function reminderStateFor(poll: PollDoc, memberId: string) {
  return (poll.reminderState || []).find(
    (s: any) => String(s.memberId) === memberId
  );
}

/// The bare deadline phrase: "today at 5:00 PM", "tomorrow at 9:00 AM",
/// "Fri, Sep 12 at 5:00 PM". The templates add "by" / "closes" around it, so
/// it must not carry either word itself.
export function deadlineLabel(deadline: Date | null, now = new Date()): string {
  return eventWhenLabel(deadline, now) || "soon";
}

function baseContext(poll: PollDoc, now: Date): Partial<TemplateContext> {
  return {
    pollId: String(poll._id),
    pollPath: pollPath(poll),
    pollTitle: String(poll.title || "").trim() || "a meeting",
    deadlineLabel: deadlineLabel(
      poll.deadline ? new Date(poll.deadline) : null,
      now
    ),
    respondedCount: (poll.responses || []).filter(
      (r: any) => r.source !== "prefill"
    ).length,
    inviteeCount: (poll.invitees || []).length,
    amountCents: 0,
  };
}

/// The first ask, sent once when the poll opens. Also seeds `reminderState` so
/// the cadence clock starts now rather than on the first cron tick.
export async function announcePollOpened(poll: PollDoc, now = new Date()) {
  const ids = (poll.invitees || []).map((i: any) => String(i.memberId));
  const context = baseContext(poll, now);
  const accentColor = await pollAccentColor(poll);
  let sent = 0;
  for (const id of ids) {
    const recipient = await recipientFor(id);
    if (!recipient) continue;
    const result = await notify({
      recipient,
      template: "availability_requested",
      context: { ...context, firstName: recipient.firstName } as TemplateContext,
      sentBy: poll.createdBy ?? null,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
    });
    if (result.sent) sent += 1;
  }
  await AvailabilityPoll.updateOne(
    { _id: poll._id },
    {
      $set: {
        reminderState: ids.map((memberId: string) => ({
          memberId: new mongoose.Types.ObjectId(memberId),
          sentCount: 1,
          lastRemindedAt: now,
        })),
      },
    }
  );
  return { sent };
}

export interface RemindOptions {
  /// A head clicked the button. Logged as sent-by them; still cadence-gated.
  actorId?: any | null;
  now?: Date;
  /// Only nudge these members (still must be outstanding). Undefined means
  /// "everyone outstanding".
  onlyMemberIds?: string[];
  /// Skip the per-poll cadence gate. Used for a head deliberately poking one
  /// named person; `maxReminders` still applies.
  ignoreCadence?: boolean;
}

export interface RemindReport {
  reminded: number;
  skippedCadence: number;
  skippedMaxed: number;
  outstanding: number;
}

/// Chase everyone who has not answered and whose last nudge is older than
/// `cadenceHours`, up to `maxReminders`. Safe to call as often as you like.
export async function remindNonResponders(
  poll: PollDoc,
  options: RemindOptions = {}
): Promise<RemindReport> {
  const now = options.now ?? new Date();
  const cadenceMs = Math.max(Number(poll.reminder?.cadenceHours) || 24, 1) * 3600_000;
  const maxReminders = Math.max(Number(poll.reminder?.maxReminders) || 5, 1);
  const only = options.onlyMemberIds
    ? new Set(options.onlyMemberIds.map(String))
    : null;
  const outstanding = outstandingInviteeIds(poll).filter(
    (id) => !only || only.has(id)
  );
  const context = baseContext(poll, now);
  const accentColor = await pollAccentColor(poll);

  let reminded = 0;
  let skippedCadence = 0;
  let skippedMaxed = 0;
  const stateOps: any[] = [];

  for (const id of outstanding) {
    const state = reminderStateFor(poll, id);
    const sentCount = state?.sentCount ?? 0;
    const last = state?.lastRemindedAt ? new Date(state.lastRemindedAt).getTime() : 0;
    if (sentCount >= maxReminders) {
      skippedMaxed += 1;
      continue;
    }
    if (!options.ignoreCadence && last && now.getTime() - last < cadenceMs) {
      skippedCadence += 1;
      continue;
    }
    const recipient = await recipientFor(id);
    if (!recipient) continue;
    const result = await notify({
      recipient,
      template: "availability_reminder",
      context: { ...context, firstName: recipient.firstName } as TemplateContext,
      sentBy: options.actorId ?? null,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
    });
    if (!result.sent) continue;
    reminded += 1;
    stateOps.push({
      updateOne: {
        filter: { _id: poll._id, "reminderState.memberId": new mongoose.Types.ObjectId(id) },
        update: {
          $set: { "reminderState.$.lastRemindedAt": now },
          $inc: { "reminderState.$.sentCount": 1 },
        },
      },
    });
    // No reminderState row yet (invitee added after the poll opened).
    stateOps.push({
      updateOne: {
        filter: {
          _id: poll._id,
          "reminderState.memberId": { $ne: new mongoose.Types.ObjectId(id) },
        },
        update: {
          $push: {
            reminderState: {
              memberId: new mongoose.Types.ObjectId(id),
              sentCount: 1,
              lastRemindedAt: now,
            },
          },
        },
      },
    });
  }

  if (stateOps.length) {
    await AvailabilityPoll.bulkWrite(stateOps, { ordered: false });
  }

  return {
    reminded,
    skippedCadence,
    skippedMaxed,
    outstanding: outstanding.length,
  };
}

/// The single "closing soon" blast, once per poll, inside the final window.
export async function sendFinalCall(poll: PollDoc, now = new Date()) {
  if (poll.finalCallSentAt) return { sent: 0 };
  const claimed = await AvailabilityPoll.updateOne(
    { _id: poll._id, finalCallSentAt: null },
    { $set: { finalCallSentAt: now } }
  );
  if (!claimed.modifiedCount) return { sent: 0 };

  const context = baseContext(poll, now);
  const accentColor = await pollAccentColor(poll);
  let sent = 0;
  for (const id of outstandingInviteeIds(poll)) {
    const recipient = await recipientFor(id);
    if (!recipient) continue;
    const result = await notify({
      recipient,
      template: "availability_final_call",
      context: { ...context, firstName: recipient.firstName } as TemplateContext,
      sentBy: poll.createdBy ?? null,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
      timeSensitive: true,
    });
    if (result.sent) sent += 1;
  }
  return { sent };
}

/// Tell the people who run the poll who is still outstanding. Once per poll,
/// and only when the reminder policy asked for it.
export async function sendHeadDigest(poll: PollDoc, now = new Date()) {
  if (!poll.reminder?.escalateToHead || poll.headDigestSentAt) return { sent: 0 };
  const outstanding = outstandingInviteeIds(poll);
  if (!outstanding.length) return { sent: 0 };

  const claimed = await AvailabilityPoll.updateOne(
    { _id: poll._id, headDigestSentAt: null },
    { $set: { headDigestSentAt: now } }
  );
  if (!claimed.modifiedCount) return { sent: 0 };

  const missing = await Member.find({ _id: { $in: outstanding } })
    .select("fName lName")
    .lean<any[]>();
  const names = missing
    .map((m) => `${m.fName ?? ""} ${m.lName ?? ""}`.trim())
    .filter(Boolean);
  const nameList =
    names.length <= 6
      ? names.join(", ")
      : `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`;

  const headIds = await pollManagerIds(poll);
  const accentColor = await pollAccentColor(poll);

  const title = String(poll.title || "").trim() || "a meeting";
  const message = {
    title: `Availability still outstanding: ${title}`,
    body: `${names.length} of ${(poll.invitees || []).length} still have not filled in ${title}. Waiting on: ${nameList}.`,
    push: `${names.length} still owe availability for ${title}.`,
    emailSubject: `Availability outstanding: ${title}`,
    link: pollPath(poll, "results"),
    category: "availability" as const,
  };

  let sent = 0;
  for (const id of headIds) {
    const recipient = await recipientFor(id);
    if (!recipient) continue;
    await notifyQuietly({
      recipient,
      template: "officer_availability_digest",
      context: { firstName: recipient.firstName, amountCents: 0 } as TemplateContext,
      message,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
    });
    sent += 1;
  }
  logger.info({ pollId: String(poll._id), sent, outstanding: names.length }, "Availability head digest sent");
  return { sent };
}
