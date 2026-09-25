// lib/notify/broadcast.ts
// Custom messages from the Notification Center.
//
// Everything else in lib/notify is written by the house: a template decides
// the wording and a route decides who hears it. Here an officer decides both,
// so the pipeline is the channels themselves, called directly, with no
// cooldown and no finance audit. The officer picks which channels to use,
// including leaving the in-app bell out, which `notify()` never allows.
import Member from "@/lib/models/Member";
import Committee from "@/lib/models/Committee";
import DeviceToken from "@/lib/models/DeviceToken";
import Notification from "@/lib/models/Notification";
import NotificationBroadcast from "@/lib/models/NotificationBroadcast";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { inAppChannel } from "@/lib/notify/channels/inapp";
import { pushChannel } from "@/lib/notify/channels/push";
import { emailChannel } from "@/lib/notify/channels/email";
import type { Channel, DeliveryRequest, Recipient } from "@/lib/notify/channels/types";
import type { RenderedMessage } from "@/lib/notify/templates";
import {
  resolveAudience,
  type AudienceMember,
  type AudienceSelection,
  type BroadcastChannel,
} from "@/lib/notify/broadcastAudience";
import { siteUrl } from "@/lib/siteUrl";
import logger from "@/lib/logger";

export const TITLE_MAX = 80;
export const BODY_MAX = 1000;
/// iOS shows about four lines on the lock screen. Longer copy still reaches
/// the bell and the inbox in full.
const PUSH_MAX = 240;
/// Small enough that a send to the whole chapter does not open a hundred
/// APNs connections at once, large enough that it finishes in seconds.
const CONCURRENCY = 4;

export interface RosterMember extends AudienceMember {
  rollNo: string;
  name: string;
  gradYear: number | null;
  ecouncilPosition: string;
  hasAccount: boolean;
  hasDevice: boolean;
  hasEmail: boolean;
}

export interface RosterCommittee {
  _id: string;
  name: string;
  color: string | null;
}

/// Every addressable member, with what each channel could reach.
export async function loadRoster(): Promise<{
  members: RosterMember[];
  committees: RosterCommittee[];
}> {
  const [members, committees, devices] = await Promise.all([
    Member.find({ status: { $in: ["Active", "Alumni"] } })
      .select(
        "_id rollNo fName lName status role isECouncil ecouncilPosition isCommitteeHead gradYear clerkId email"
      )
      .sort({ lName: 1, fName: 1 })
      .lean<any[]>(),
    Committee.find({})
      .select("_id name color committeeHeadId committeeMembers")
      .sort({ name: 1 })
      .lean<any[]>(),
    DeviceToken.distinct("memberId", { disabledAt: null }),
  ]);

  const withDevice = new Set(devices.map((id: any) => String(id)));
  const committeeIds = new Map<string, Set<string>>();
  const headOf = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, memberId: any, committeeId: string) => {
    if (!memberId) return;
    const key = String(memberId);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(committeeId);
  };
  for (const committee of committees) {
    const id = String(committee._id);
    for (const memberId of committee.committeeMembers ?? []) add(committeeIds, memberId, id);
    add(committeeIds, committee.committeeHeadId, id);
    add(headOf, committee.committeeHeadId, id);
  }

  return {
    members: members.map((member) => {
      const id = String(member._id);
      return {
        _id: id,
        rollNo: member.rollNo ?? "",
        name: `${member.fName ?? ""} ${member.lName ?? ""}`.trim(),
        status: member.status ?? null,
        role: member.role ?? null,
        isECouncil: Boolean(member.isECouncil),
        ecouncilPosition: member.ecouncilPosition ?? "",
        isCommitteeHead: Boolean(member.isCommitteeHead),
        gradYear: member.gradYear ?? null,
        committeeIds: Array.from(committeeIds.get(id) ?? []),
        headOf: Array.from(headOf.get(id) ?? []),
        hasAccount: Boolean(member.clerkId),
        hasDevice: withDevice.has(id),
        // Clerk is the source of truth and the cache is topped up at send
        // time, so an account with no cached address still counts.
        hasEmail: Boolean(member.email) || Boolean(member.clerkId),
      };
    }),
    committees: committees.map((committee) => ({
      _id: String(committee._id),
      name: committee.name,
      color: committee.color ?? null,
    })),
  };
}

/// The stable address for a broadcast's picture. Re-signed per request, so it
/// still works when somebody opens the email next week.
export function broadcastImageUrl(broadcastId: any): string {
  return `${siteUrl()}/api/notification-images/${broadcastId}`;
}

export interface BroadcastInput {
  title: string;
  body: string;
  link: string;
  imageKey: string;
  channels: BroadcastChannel[];
  selection: AudienceSelection;
  audienceLabel: string;
  isTest: boolean;
  actor: { _id: any; name: string };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function renderMessage(input: BroadcastInput, broadcastId: any): RenderedMessage {
  const imageUrl = input.imageKey ? broadcastImageUrl(broadcastId) : undefined;
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  // No em dashes in anything that reaches a member: plain commas only.
  return {
    title: input.title,
    body: input.body,
    push: truncate(input.body.replace(/\s+/g, " ").trim(), PUSH_MAX),
    emailSubject: input.title,
    link: input.link || "/member",
    category: "general",
    ctaLabel: input.link ? "Open in Chapter Tools" : "Open Chapter Tools",
    pushThreadId: `broadcast-${broadcastId}`,
    pushImageUrl: imageUrl,
    email: {
      title: input.title,
      heroImageUrl: imageUrl,
      heroImageAlt: imageUrl ? input.title : undefined,
      align: "left",
      paragraphs: paragraphs.length ? paragraphs : [input.body],
      footnote: `Sent by ${input.actor.name || "a chapter officer"} on behalf of Theta Tau Delta Gamma.`,
      preheader: truncate(input.body.replace(/\s+/g, " ").trim(), 120),
    },
  };
}

const CHANNELS: Record<Exclude<BroadcastChannel, "inapp">, Channel> = {
  push: pushChannel,
  email: emailChannel,
};

/// Write the history row. Returns the id so the route can answer immediately
/// and let the send continue behind the response.
export async function createBroadcast(
  input: BroadcastInput,
  audience: RosterMember[]
) {
  return NotificationBroadcast.create({
    title: input.title,
    body: input.body,
    link: input.link,
    imageKey: input.imageKey,
    channels: input.channels,
    audience: input.selection,
    audienceLabel: input.audienceLabel,
    isTest: input.isTest,
    status: "sending",
    recipientCount: audience.length,
    recipients: audience.map((member) => ({
      memberId: member._id,
      name: member.name,
      rollNo: member.rollNo,
      status: member.status ?? "",
      attempts: [],
    })),
    sentBy: input.actor._id,
    sentByName: input.actor.name,
  });
}

/// Deliver one broadcast to everyone on it and record every outcome.
///
/// Never throws. The route has already answered; a failure here ends up on
/// the history row as a failed status rather than as an unhandled rejection.
export async function deliverBroadcast(
  broadcastId: any,
  input: BroadcastInput,
  audience: RosterMember[]
): Promise<void> {
  try {
    const message = renderMessage(input, broadcastId);
    const wantsInApp = input.channels.includes("inapp");
    const external = input.channels.filter(
      (channel): channel is Exclude<BroadcastChannel, "inapp"> => channel !== "inapp"
    );

    const emailById = new Map<string, string | null>();
    if (input.channels.includes("email")) {
      await ensureMemberEmails(audience.map((member) => member._id)).catch(() => undefined);
      const rows = await Member.find({ _id: { $in: audience.map((m) => m._id) } })
        .select("_id email")
        .lean<any[]>();
      rows.forEach((row) => emailById.set(String(row._id), row.email ?? null));
    }

    const results: Array<{
      memberId: string;
      attempts: Array<{ channel: string; delivered: boolean; reason?: string }>;
    }> = [];

    const sendTo = async (member: RosterMember) => {
      const [firstName, ...rest] = member.name.split(" ");
      const recipient: Recipient = {
        memberId: member._id,
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        rollNo: member.rollNo,
        email: emailById.get(member._id) ?? null,
      };
      const request: DeliveryRequest = {
        recipient,
        template: "broadcast_custom",
        message,
        amountCents: null,
        refs: {},
        sentBy: input.actor._id,
        explicitChannels: input.channels,
      };

      const attempts: Array<{ channel: string; delivered: boolean; reason?: string }> = [];
      let notificationId: any = null;

      if (wantsInApp) {
        if (!member.hasAccount) {
          // A roster placeholder has no bell to ring, and a row for one would
          // be an unread badge nobody can ever clear.
          attempts.push({ channel: "inapp", delivered: false, reason: "no account" });
        } else {
          try {
            const result = await inAppChannel.deliver(request);
            notificationId = result.id ?? null;
            attempts.push({ channel: "inapp", delivered: true });
          } catch (err: any) {
            logger.warn({ err, rollNo: member.rollNo }, "Broadcast in-app row failed");
            attempts.push({ channel: "inapp", delivered: false, reason: "storage error" });
          }
        }
      }

      for (const name of external) {
        try {
          const result = await CHANNELS[name].deliver(request);
          attempts.push({
            channel: name,
            delivered: result.delivered,
            ...(result.skipped ? { reason: result.skipped } : {}),
          });
        } catch (err: any) {
          logger.warn({ err, channel: name, rollNo: member.rollNo }, "Broadcast channel threw");
          attempts.push({ channel: name, delivered: false, reason: "channel threw" });
        }
      }

      if (notificationId) {
        await Notification.updateOne(
          { _id: notificationId },
          {
            $set: {
              channels: attempts.filter((a) => a.delivered).map((a) => a.channel),
              deliveryAttempts: attempts.map((a) => ({ ...a, attemptedAt: new Date() })),
            },
          }
        ).catch(() => undefined);
      }

      results.push({ memberId: member._id, attempts });
    };

    const queue = [...audience];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const next = queue.shift()!;
          await sendTo(next);
        }
      })
    );

    const byId = new Map(results.map((result) => [result.memberId, result.attempts]));
    const channelCounts: Record<string, number> = {};
    let reachedCount = 0;
    for (const result of results) {
      const delivered = result.attempts.filter((a) => a.delivered);
      if (delivered.length) reachedCount += 1;
      for (const attempt of delivered) {
        channelCounts[attempt.channel] = (channelCounts[attempt.channel] ?? 0) + 1;
      }
    }

    const status =
      reachedCount === 0 && audience.length > 0
        ? "failed"
        : reachedCount < audience.length
          ? "partial"
          : "sent";

    await NotificationBroadcast.updateOne(
      { _id: broadcastId },
      {
        $set: {
          status,
          reachedCount,
          channelCounts,
          completedAt: new Date(),
          recipients: audience.map((member) => ({
            memberId: member._id,
            name: member.name,
            rollNo: member.rollNo,
            status: member.status ?? "",
            attempts: byId.get(member._id) ?? [],
          })),
        },
      }
    );

    logger.info(
      { broadcastId: String(broadcastId), reachedCount, of: audience.length, channelCounts },
      "Notification Center broadcast delivered"
    );
  } catch (err: any) {
    logger.error({ err, broadcastId: String(broadcastId) }, "Notification Center broadcast failed");
    await NotificationBroadcast.updateOne(
      { _id: broadcastId },
      { $set: { status: "failed", completedAt: new Date() } }
    ).catch(() => undefined);
  }
}

export { resolveAudience };
