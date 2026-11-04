// lib/notify/sendBroadcast.ts
// Validating and queueing a Notification Center message.
//
// This was the body of `POST /api/admin/notification-center/send`. The MCP
// `send_announcement` tool queues the same message, with the same limits, the
// same audience resolution and the same history row, so it is here once. The
// caller has already checked `isChapterToolSubmitter`.
import {
  BODY_MAX,
  TITLE_MAX,
  createBroadcast,
  deliverBroadcast,
  loadRoster,
  resolveAudience,
} from "@/lib/notify/broadcast";
import {
  BROADCAST_CHANNELS,
  describeAudience,
  type AudienceSelection,
  type BroadcastChannel,
} from "@/lib/notify/broadcastAudience";
import logger from "@/lib/logger";

const CHANNEL_IDS = new Set<string>(BROADCAST_CHANNELS.map((channel) => channel.id));

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 1000)
    : [];
}

export type QueueBroadcastResult =
  | { ok: true; id: string; recipientCount: number }
  | { ok: false; status: number; error: string };

/// `payload` is the request body: `title`, `body`, optional `link`, `imageKey`,
/// `test`, `channels` and `audience: { groups, committeeIds, memberIds }`.
export async function queueBroadcast(
  submitter: any,
  payload: any
): Promise<QueueBroadcastResult> {
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const link = typeof payload?.link === "string" ? payload.link.trim() : "";
  const imageKey = typeof payload?.imageKey === "string" ? payload.imageKey.trim() : "";
  const isTest = payload?.test === true;
  const channels = Array.from(new Set(strings(payload?.channels))).filter((channel) =>
    CHANNEL_IDS.has(channel)
  ) as BroadcastChannel[];

  if (!title) return { ok: false, status: 400, error: "Add a title." };
  if (title.length > TITLE_MAX) {
    return { ok: false, status: 400, error: `Keep the title under ${TITLE_MAX} characters.` };
  }
  if (!body) return { ok: false, status: 400, error: "Add a message." };
  if (body.length > BODY_MAX) {
    return { ok: false, status: 400, error: `Keep the message under ${BODY_MAX} characters.` };
  }
  if (link && (!link.startsWith("/") || link.startsWith("//"))) {
    return {
      ok: false,
      status: 400,
      error: "Links must be a page on this site, like /member/events.",
    };
  }
  if (imageKey && !imageKey.startsWith("notifications/")) {
    return { ok: false, status: 400, error: "That image is not a notification upload." };
  }
  if (!channels.length) {
    return { ok: false, status: 400, error: "Choose at least one way to send it." };
  }

  try {
    const roster = await loadRoster();
    const me = String(submitter._id);
    const selection: AudienceSelection = isTest
      ? { groups: [], committeeIds: [], memberIds: [me] }
      : {
          groups: strings(payload?.audience?.groups),
          committeeIds: strings(payload?.audience?.committeeIds),
          memberIds: strings(payload?.audience?.memberIds),
        };
    const audience = resolveAudience(roster.members, selection);
    if (!audience.length) {
      return { ok: false, status: 400, error: "Nobody matches that audience." };
    }

    const committeeNames = Object.fromEntries(
      roster.committees.map((committee) => [committee._id, committee.name])
    );
    const actorName = `${submitter.fName ?? ""} ${submitter.lName ?? ""}`.trim();
    const input = {
      title,
      body,
      link,
      imageKey,
      channels,
      selection,
      audienceLabel: isTest ? "Test to yourself" : describeAudience(selection, committeeNames),
      isTest,
      actor: { _id: submitter._id, name: actorName },
    };

    const broadcast = await createBroadcast(input, audience);
    logger.info(
      { broadcastId: String(broadcast._id), by: submitter.rollNo, recipients: audience.length, channels },
      "Notification Center broadcast queued"
    );

    // Not awaited: the officer should not sit on a hundred pushes and emails.
    // `deliverBroadcast` records its own failures on the history row.
    void deliverBroadcast(broadcast._id, input, audience);

    return { ok: true, id: String(broadcast._id), recipientCount: audience.length };
  } catch (err: any) {
    logger.error({ err }, "Failed to queue Notification Center broadcast");
    return { ok: false, status: 500, error: "The message could not be sent." };
  }
}
