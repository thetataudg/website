// lib/notify/index.ts
// One way in. "Remind all" and the nightly job travel this exact path, so a
// hand-sent reminder and a system one are indistinguishable in the history
// except for the actor.
//
// The order matters and is the whole design: gate first, then record the
// in-app notification and the FinanceEvent, then fan out to whatever external
// channels happen to be configured. The audit line is written whether or not
// an email or a push got through — a reminder we sent and couldn't deliver is
// a different fact from a reminder we never sent, and only the first one is
// worth arguing about later.
import Notification from "@/lib/models/Notification";
import Member from "@/lib/models/Member";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { recordFinanceEvent } from "@/lib/financeEvents";
import logger from "@/lib/logger";
import {
  AnyTemplate,
  NotifyTemplate,
  RenderedMessage,
  TemplateContext,
  isReminderTemplate,
  renderTemplate,
} from "@/lib/notify/templates";
import { inAppChannel } from "@/lib/notify/channels/inapp";
import { emailChannel } from "@/lib/notify/channels/email";
import { pushChannel } from "@/lib/notify/channels/push";
import type { Channel, Recipient } from "@/lib/notify/channels/types";

export const COOLDOWN_HOURS = 24;

const EXTERNAL_CHANNELS: Channel[] = [emailChannel, pushChannel];

export interface NotifyInput {
  recipient: Recipient;
  template: AnyTemplate;
  context: TemplateContext;
  /// Already-rendered wording, for messages that don't come from the member
  /// template table — the officer feed builds its own from the audit summary.
  /// When present the template is a label and a cooldown key, nothing more.
  message?: RenderedMessage;
  amountCents?: number | null;
  refs?: Record<string, any>;
  /// Null for the cron. A treasurer's click carries their id so the timeline
  /// can say who did the chasing.
  sentBy?: any | null;
  /// Wording the officer wrote instead of the template's. Merged over the
  /// rendered message rather than replacing it, so a custom line still gets a
  /// correct subject, link and category without the officer supplying them.
  override?: Partial<RenderedMessage>;
  /// Which external channels to attempt. Undefined means all of them. In-app
  /// is not listed because it is the record, not a delivery choice.
  channels?: string[];
  /// Send this one as a time-sensitive alert. See the note on
  /// `DeliveryRequest.timeSensitive` for when that is justified.
  timeSensitive?: boolean;
  /// Whether to write a `reminder_sent` row to the recipient's financial
  /// history. True for anything sent *to* the member it concerns.
  ///
  /// False for the officer feed, and that is not an optimisation. A finance
  /// event is stamped with the member whose ledger it belongs to, so auditing
  /// five officers' copies of "Vinny paid $45" would write four rows onto four
  /// timelines describing money that was never theirs. The action itself is
  /// already recorded once, on the right person, by the route that did it.
  audit?: boolean;
}

export interface NotifyResult {
  sent: boolean;
  /// Set when the cooldown or a missing recipient stopped it. The caller
  /// reports these back honestly rather than counting them as sends.
  skipped?: "cooldown" | "no recipient";
  channels: string[];
}

/// Has this member already had this template inside the cooldown window?
///
/// Enforced here rather than by disabling a button. A nervous treasurer
/// clicking "Remind all" four times must not send four pushes to sixty people —
/// and the rule has to hold for the cron, for a second officer on another
/// laptop, and for a retried request, none of which a disabled button reaches.
export async function isInCooldown(
  memberId: any,
  template: AnyTemplate,
  now = new Date()
): Promise<boolean> {
  if (!isReminderTemplate(template)) return false;
  const since = new Date(now.getTime() - COOLDOWN_HOURS * 3600_000);
  const recent = await Notification.countDocuments({
    memberId,
    template,
    createdAt: { $gte: since },
  });
  return recent > 0;
}

/// Batch version, so a sixty-person send costs one query rather than sixty.
export async function membersInCooldown(
  memberIds: any[],
  template: AnyTemplate,
  now = new Date()
): Promise<Set<string>> {
  if (!memberIds.length || !isReminderTemplate(template)) return new Set();
  const since = new Date(now.getTime() - COOLDOWN_HOURS * 3600_000);
  const recent = await Notification.find({
    memberId: { $in: memberIds },
    template,
    createdAt: { $gte: since },
  })
    .select("memberId")
    .lean<any[]>();
  return new Set(recent.map((row) => row.memberId?.toString()).filter(Boolean));
}

/// Tell one member one thing.
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const { recipient, template } = input;
  if (!recipient?.memberId) {
    return { sent: false, skipped: "no recipient", channels: [] };
  }

  if (await isInCooldown(recipient.memberId, template)) {
    return { sent: false, skipped: "cooldown", channels: [] };
  }

  const message = {
    ...(input.message ?? renderTemplate(template as NotifyTemplate, input.context)),
    ...(input.override ?? {}),
  };
  const amountCents =
    input.amountCents === undefined
      ? input.context.amountCents ?? null
      : input.amountCents;
  const request = {
    recipient,
    template,
    message,
    amountCents,
    refs: input.refs ?? {},
    sentBy: input.sentBy ?? null,
    timeSensitive: input.timeSensitive ?? false,
  };

  // In-app first and always. It is the record; the rest are attempts to reach
  // someone who isn't looking at the app right now.
  const delivered: string[] = [];
  let notificationId: any = null;
  try {
    const result = await inAppChannel.deliver(request);
    delivered.push("inapp");
    notificationId = result.id ?? null;
  } catch (err: any) {
    // If even this failed the member has no way to learn what we tried to tell
    // them, so the whole send is a failure rather than a partial one.
    logger.error({ err, rollNo: recipient.rollNo, template }, "In-app notification failed");
    return { sent: false, channels: [] };
  }

  const wanted = input.channels
    ? EXTERNAL_CHANNELS.filter((channel) => input.channels!.includes(channel.name))
    : EXTERNAL_CHANNELS;

  for (const channel of wanted) {
    if (!channel.isConfigured()) continue;
    try {
      const result = await channel.deliver(request);
      if (result.delivered) delivered.push(result.channel);
    } catch (err: any) {
      logger.warn({ err, channel: channel.name }, "Notification channel threw");
    }
  }

  if (notificationId && delivered.length > 1) {
    await Notification.updateOne(
      { _id: notificationId },
      { $set: { channels: delivered } }
    ).catch(() => undefined);
  }

  if (input.audit === false) {
    return { sent: true, channels: delivered };
  }

  await recordFinanceEvent({
    memberId: recipient.memberId,
    actorId: input.sentBy ?? null,
    type: "reminder_sent",
    amountCents,
    summary: `${message.title}${delivered.length ? `, sent via ${delivered.join(", ")}` : ", recorded but no channel reached them"}`,
    channel: delivered.join(","),
    refs: input.refs ?? {},
    meta: { template, channels: delivered },
  });

  return { sent: true, channels: delivered };
}

/// What actually happened on a send, in the words the treasurer needs to hear.
export interface SendReport {
  sentCount: number;
  skippedCount: number;
  /// "Sent to 23. Skipped 11 already reminded today." The honesty is the point:
  /// a treasurer who can't see the cooldown working will fight it.
  summary: string;
  channels: string[];
  recipients: Array<{ rollNo: string; name: string; sent: boolean; reason?: string }>;
}

export async function notifyMany(
  inputs: NotifyInput[]
): Promise<SendReport> {
  const recipients: SendReport["recipients"] = [];
  const channels = new Set<string>();
  let sentCount = 0;
  let cooldownCount = 0;

  for (const input of inputs) {
    const result = await notify(input);
    if (result.sent) {
      sentCount += 1;
      result.channels.forEach((channel) => channels.add(channel));
    } else if (result.skipped === "cooldown") {
      cooldownCount += 1;
    }
    recipients.push({
      rollNo: input.recipient.rollNo,
      name: `${input.recipient.firstName} ${input.recipient.lastName}`.trim(),
      sent: result.sent,
      reason: result.skipped,
    });
  }

  const skippedCount = inputs.length - sentCount;
  const parts = [`Sent to ${sentCount}.`];
  if (cooldownCount > 0) {
    parts.push(`Skipped ${cooldownCount} already reminded today.`);
  }
  const otherSkips = skippedCount - cooldownCount;
  if (otherSkips > 0) parts.push(`${otherSkips} couldn't be reached.`);
  if (sentCount === 0 && skippedCount === 0) {
    parts.length = 0;
    parts.push("Nobody needed reminding.");
  }

  return {
    sentCount,
    skippedCount,
    summary: parts.join(" "),
    channels: Array.from(channels),
    recipients,
  };
}

/// Build a recipient from a member id.
///
/// For the transactional notices, which arrive one at a time in response to
/// something an officer just did — so the extra Clerk lookup is one call on a
/// path that already did several, not sixty on a batch send.
export async function recipientFor(memberId: any): Promise<Recipient | null> {
  const member = await Member.findById(memberId)
    .select("_id rollNo fName lName email clerkId")
    .lean<any>();
  if (!member) return null;
  if (!member.email && member.clerkId) {
    await ensureMemberEmails([member._id]).catch(() => undefined);
    const refreshed = await Member.findById(memberId).select("email").lean<any>();
    member.email = refreshed?.email ?? null;
  }
  return {
    memberId: member._id,
    firstName: member.fName ?? "",
    lastName: member.lName ?? "",
    rollNo: member.rollNo ?? "",
    email: member.email ?? null,
  };
}

/// Fire-and-forget for the transactional notices.
///
/// A failure to tell someone their payment was verified must never fail the
/// verification itself — the money moving is the thing that matters, and the
/// notification is a courtesy on top of a record that already exists.
export async function notifyQuietly(input: NotifyInput): Promise<void> {
  try {
    await notify(input);
  } catch (err: any) {
    logger.warn(
      { err, template: input.template, rollNo: input.recipient?.rollNo },
      "Transactional notice failed — the change it describes still happened"
    );
  }
}

export { renderTemplate };
export type { Recipient };
