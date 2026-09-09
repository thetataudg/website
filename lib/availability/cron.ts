// lib/availability/cron.ts
// The hourly sweep that chases availability polls so a head does not have to.
//
// Mirrors `lib/duesCron.ts`: all the logic lives here, the Netlify function
// and the secret-guarded `/api/availability/cron` route are thin wrappers so
// the schedule and a manual `curl` run the exact same code.
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { getArizonaNow } from "@/lib/recurrence";
import { notifyQuietly, recipientFor } from "@/lib/notify";
import type { TemplateContext } from "@/lib/notify/templates";
import {
  NAG_CHANNELS,
  outstandingInviteeIds,
  pollAccentColor,
  pollManagerIds,
  pollPath,
  remindNonResponders,
  sendFinalCall,
  sendHeadDigest,
} from "@/lib/availability/remind";

/// Nagging outside waking hours is how a chapter learns to turn notifications
/// off. 8am to 9pm Phoenix, matching the dues cron's spirit.
const QUIET_BEFORE_HOUR = 8;
const QUIET_AFTER_HOUR = 21;

export interface AvailabilityCronReport {
  ran: boolean;
  reason?: string;
  pollsProcessed: number;
  reminded: number;
  finalCalls: number;
  headDigests: number;
  closed: number;
}

/// Poll hit its deadline: freeze it and tell whoever runs it that the results
/// are ready to schedule from.
async function closePoll(poll: any, now: Date): Promise<boolean> {
  const claimed = await AvailabilityPoll.updateOne(
    { _id: poll._id, status: "open" },
    { $set: { status: "closed" } }
  );
  if (!claimed.modifiedCount) return false;

  const title = String(poll.title || "").trim() || "the meeting poll";
  const responded = (poll.responses || []).filter(
    (r: any) => r.source !== "prefill"
  ).length;
  const message = {
    title: `${title} is ready to schedule`,
    body: `${title} has closed with ${responded} of ${
      (poll.invitees || []).length
    } responses. Open the results to pick a time and create the event.`,
    push: `${title} closed. Pick a time from the results.`,
    emailSubject: `${title} is ready to schedule`,
    link: pollPath(poll, "results"),
    category: "availability" as const,
  };
  const accentColor = await pollAccentColor(poll);
  for (const id of await pollManagerIds(poll)) {
    const recipient = await recipientFor(id);
    if (!recipient) continue;
    await notifyQuietly({
      recipient,
      template: "officer_availability_results_ready",
      context: { firstName: recipient.firstName, amountCents: 0 } as TemplateContext,
      message,
      channels: NAG_CHANNELS,
      accentColor,
      audit: false,
    });
  }
  logger.info({ pollId: String(poll._id) }, "Availability poll closed at deadline");
  return true;
}

export async function runAvailabilityCron(
  now = new Date()
): Promise<AvailabilityCronReport> {
  const azHour = getArizonaNow().hour;
  const report: AvailabilityCronReport = {
    ran: true,
    pollsProcessed: 0,
    reminded: 0,
    finalCalls: 0,
    headDigests: 0,
    closed: 0,
  };

  const quiet = azHour < QUIET_BEFORE_HOUR || azHour >= QUIET_AFTER_HOUR;

  const polls = await AvailabilityPoll.find({ status: "open" }).lean<any[]>();
  for (const poll of polls) {
    report.pollsProcessed += 1;
    const deadline = poll.deadline ? new Date(poll.deadline) : null;

    // The deadline is a hard event and runs regardless of the hour.
    if (deadline && now.getTime() >= deadline.getTime()) {
      if (await closePoll(poll, now)) report.closed += 1;
      continue;
    }

    if (quiet) continue;

    const nudge = await remindNonResponders(poll, { now });
    report.reminded += nudge.reminded;

    if (deadline) {
      const finalWindowMs =
        Math.max(Number(poll.reminder?.finalCallHours) || 24, 1) * 3600_000;
      if (deadline.getTime() - now.getTime() <= finalWindowMs) {
        const fc = await sendFinalCall(poll, now);
        report.finalCalls += fc.sent;
      }
    }

    if (poll.reminder?.escalateToHead && outstandingInviteeIds(poll).length) {
      const digest = await sendHeadDigest(poll, now);
      if (digest.sent) report.headDigests += 1;
    }
  }

  if (quiet && report.closed === 0) {
    report.reason = `quiet hours (Phoenix hour ${azHour})`;
  }
  logger.info(report, "Availability cron completed");
  return report;
}

/// Exposed for the check script: does a member have a usable contact channel?
export async function inviteeHasContact(memberId: any): Promise<boolean> {
  const member = await Member.findById(memberId).select("email discordId").lean<any>();
  return !!(member?.email || member?.discordId);
}
