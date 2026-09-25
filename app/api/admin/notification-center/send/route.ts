// POST /api/admin/notification-center/send — send a custom message.
//
// The browser sends the selection (groups, committees, hand-picked members),
// never a list of recipients: the audience is resolved again here with the
// same rule the compose page previewed, against the roster as it is now.
//
// Answers as soon as the history row exists and delivers behind the response,
// the same way a newsletter announcement does. The page follows progress on
// the history row.
import { NextResponse } from "next/server";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNEL_IDS = new Set<string>(BROADCAST_CHANNELS.map((channel) => channel.id));

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 1000)
    : [];
}

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }
  const submitter = actor.submitter as any;

  const payload = await req.json().catch(() => null);
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const link = typeof payload?.link === "string" ? payload.link.trim() : "";
  const imageKey = typeof payload?.imageKey === "string" ? payload.imageKey.trim() : "";
  const isTest = payload?.test === true;
  const channels = Array.from(new Set(strings(payload?.channels))).filter((channel) =>
    CHANNEL_IDS.has(channel)
  ) as BroadcastChannel[];

  if (!title) return NextResponse.json({ error: "Add a title." }, { status: 400 });
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ error: `Keep the title under ${TITLE_MAX} characters.` }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "Add a message." }, { status: 400 });
  if (body.length > BODY_MAX) {
    return NextResponse.json({ error: `Keep the message under ${BODY_MAX} characters.` }, { status: 400 });
  }
  if (link && (!link.startsWith("/") || link.startsWith("//"))) {
    return NextResponse.json(
      { error: "Links must be a page on this site, like /member/events." },
      { status: 400 }
    );
  }
  if (imageKey && !imageKey.startsWith("notifications/")) {
    return NextResponse.json({ error: "That image is not a notification upload." }, { status: 400 });
  }
  if (!channels.length) {
    return NextResponse.json({ error: "Choose at least one way to send it." }, { status: 400 });
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
      return NextResponse.json({ error: "Nobody matches that audience." }, { status: 400 });
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

    return NextResponse.json(
      { id: String(broadcast._id), recipientCount: audience.length },
      { status: 202 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to queue Notification Center broadcast");
    return NextResponse.json({ error: "The message could not be sent." }, { status: 500 });
  }
}
