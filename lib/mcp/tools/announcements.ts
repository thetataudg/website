// lib/mcp/tools/announcements.ts
// Announcements are the Notification Center: an officer composes a message and
// picks push / in-app / email and an audience. Its permission is
// `isChapterToolSubmitter` (admins, the Regent, the Vice Regent) and the send
// is `queueBroadcast`, the same function behind its route, so limits, audience
// resolution and the history row are identical.
//
// Sending to members needs `confirm: true`. Without it the tool only reports
// who would be reached. A test send, which goes to the caller alone, does not.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import NotificationBroadcast from "@/lib/models/NotificationBroadcast";
import { isChapterToolSubmitter } from "@/lib/chapterTools";
import { loadRoster, resolveAudience } from "@/lib/notify/broadcast";
import { AUDIENCE_GROUPS, BROADCAST_CHANNELS, describeAudience } from "@/lib/notify/broadcastAudience";
import { queueBroadcast } from "@/lib/notify/sendBroadcast";
import { serializeBroadcast } from "@/app/api/admin/notification-center/history/serialize";
import {
  READ_ONLY,
  WRITE,
  ToolError,
  defineTool,
  type McpContext,
} from "@/lib/mcp/tool";
import { requireCommittee, requireMember } from "@/lib/mcp/resolve";

function requireSubmitter(ctx: McpContext) {
  if (!isChapterToolSubmitter(ctx.member)) {
    throw new ToolError(
      "Not allowed: announcements can only be sent by an admin, the Regent, or the Vice Regent."
    );
  }
}

const GROUP_IDS = AUDIENCE_GROUPS.map((group) => group.id) as [string, ...string[]];
const CHANNEL_IDS = BROADCAST_CHANNELS.map((channel) => channel.id) as [string, ...string[]];

export function registerAnnouncementTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "list_announcements", {
    title: "List announcements",
    description:
      "Recent Notification Center messages that were sent to members: title, audience, channels, how many were reached. Admins, the Regent and the Vice Regent only.",
    input: { limit: z.number().int().min(1).max(25).default(10) },
    annotations: READ_ONLY,
    run: async ({ limit }, c) => {
      requireSubmitter(c);
      const rows = await NotificationBroadcast.find({})
        .select("-recipients")
        .sort({ createdAt: -1 })
        .limit(limit ?? 10)
        .lean<any[]>();
      const items = await Promise.all(rows.map((row) => serializeBroadcast(row, false)));
      return { count: items.length, announcements: items.map(({ imageUrl, ...rest }) => rest) };
    },
  });

  defineTool(server, ctx, "send_announcement", {
    title: "Send an announcement",
    description:
      "Send a message to members through push, the in-app bell and/or email. Admins, the Regent and the Vice Regent only. This reaches real people and cannot be recalled: without confirm: true nothing is sent and the tool only reports the audience size, so show the user the title, body, audience and channels and get their go-ahead first. test: true sends only to you and needs no confirmation. Do not use em dashes in the text.",
    input: {
      title: z.string().min(1).max(80),
      body: z.string().min(1).max(1000),
      channels: z.array(z.enum(CHANNEL_IDS)).min(1).describe("push, inapp and/or email."),
      audienceGroups: z
        .array(z.enum(GROUP_IDS))
        .optional()
        .describe("everyone, actives, alumni, ecouncil, admins or committee_heads."),
      committees: z.array(z.string()).optional().describe("Committee names or ids to include."),
      members: z.array(z.string()).optional().describe("Member ids, roll numbers or full names to include."),
      link: z.string().optional().describe("A page on this site, like /member/events."),
      test: z.boolean().optional().describe("Send only to yourself."),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true to actually send to members."),
    },
    annotations: WRITE,
    run: async (args, c) => {
      requireSubmitter(c);

      const committeeIds: string[] = [];
      for (const ref of (args.committees ?? []) as string[]) {
        committeeIds.push(String((await requireCommittee(ref))._id));
      }
      const memberIds: string[] = [];
      for (const ref of (args.members ?? []) as string[]) {
        memberIds.push(String((await requireMember(ref))._id));
      }
      const audience = {
        groups: (args.audienceGroups ?? []) as string[],
        committeeIds,
        memberIds,
      };
      const isTest = args.test === true;

      if (!isTest && args.confirm !== true) {
        const roster = await loadRoster();
        const reached = resolveAudience(roster.members, audience);
        const names = Object.fromEntries(roster.committees.map((committee) => [committee._id, committee.name]));
        return {
          sent: false,
          reason: "confirm was not true, so nothing was sent.",
          wouldReach: reached.length,
          audience: describeAudience(audience, names),
          channels: args.channels,
          next: "Show the user the message and audience, and call again with confirm: true to send.",
        };
      }

      const result = await queueBroadcast(c.member, {
        title: args.title,
        body: args.body,
        link: args.link ?? "",
        channels: args.channels,
        audience,
        test: isTest,
      });
      if (!result.ok) throw new ToolError(result.error);
      return {
        sent: true,
        announcementId: result.id,
        recipients: result.recipientCount,
        note: "Delivery continues in the background. list_announcements shows the outcome.",
      };
    },
  });
}
