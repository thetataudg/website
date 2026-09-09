// lib/notify/channels/discord.ts
// A direct message from the chapter bot.
//
// Hand-rolled against Discord's REST API rather than routed through `TTDG Bot/`.
// That process is a *client* of this website, not a server we can call, so the
// website talks to Discord itself the same way `channels/push.ts` talks to
// APNs: two authenticated POSTs, no library.
//
//   1. POST /users/@me/channels { recipient_id }  -> a DM channel id
//   2. POST /channels/{id}/messages { embeds }     -> the message
//
// Opt-in on purpose. Adding this channel to the pipeline would otherwise start
// DMing the whole roster about every dues notice, vote and event the moment a
// bot token is present. So it stays inert unless either:
//   - DISCORD_DM_NOTIFICATIONS is "true" (the chapter turned it on globally), or
//   - the individual send named "discord" in its `channels` (this feature does).
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Channel, DeliveryRequest, DeliveryResult } from "./types";

const API = "https://discord.com/api/v10";

/// Theta Tau crimson, the fallback stripe when a send carries no accent.
const CHAPTER_COLOR = 0x7a0104;

/// "#RRGGBB" -> 0xRRGGBB, or the chapter colour when it isn't a valid hex.
function toEmbedColor(hex: string | null | undefined): number {
  if (!hex) return CHAPTER_COLOR;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? parseInt(m[1], 16) : CHAPTER_COLOR;
}

/// The stripe under a category, used only when the send gives no `accentColor`.
const CATEGORY_COLOR: Record<string, number> = {
  dues: 0x7a0104,
  reimbursement: 0x0a9396,
  plan: 0x3f4e8f,
  event: 0x005f73,
  availability: 0x3f8f76,
  general: 0x7a0104,
};

function botToken(): string | null {
  return (
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    null
  );
}

function globallyEnabled(): boolean {
  return process.env.DISCORD_DM_NOTIFICATIONS?.trim().toLowerCase() === "true";
}

async function discordPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res;
}

export const discordChannel: Channel = {
  name: "discord",

  isConfigured() {
    return !!botToken() && globallyEnabled();
  },

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    const token = botToken();
    if (!token) {
      return { channel: "discord", delivered: false, skipped: "no bot token" };
    }
    const optedIn =
      globallyEnabled() || !!request.explicitChannels?.includes("discord");
    if (!optedIn) {
      return { channel: "discord", delivered: false, skipped: "not enabled" };
    }

    const member = await Member.findById(request.recipient.memberId)
      .select("discordId")
      .lean<any>();
    const discordId = member?.discordId;
    if (!discordId) {
      return {
        channel: "discord",
        delivered: false,
        skipped: "no linked Discord account",
      };
    }

    try {
      const channelRes = await discordPost("/users/@me/channels", token, {
        recipient_id: discordId,
      });
      if (!channelRes.ok) {
        // 403 here is "this user does not share a server with the bot or has
        // DMs closed" — a soft, expected failure, not an outage.
        const soft = channelRes.status === 403;
        return {
          channel: "discord",
          delivered: false,
          skipped: soft
            ? "recipient has DMs closed"
            : `open DM failed: ${channelRes.status}`,
        };
      }
      const channel = (await channelRes.json()) as { id?: string };
      if (!channel.id) {
        return { channel: "discord", delivered: false, skipped: "no DM channel id" };
      }

      const url = absoluteUrl(request.message.link || "/member");
      const color = request.accentColor
        ? toEmbedColor(request.accentColor)
        : CATEGORY_COLOR[request.message.category] ?? CHAPTER_COLOR;
      const first = (request.recipient.firstName || "").trim();

      const msgRes = await discordPost(`/channels/${channel.id}/messages`, token, {
        embeds: [
          {
            author: { name: "Theta Tau · Delta Gamma" },
            title: request.message.title,
            description: first
              ? `Hi ${first},\n\n${request.message.body}`
              : request.message.body,
            url,
            color,
            footer: { text: "You can turn these off in the app." },
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 5, label: "Open in the app", url }],
          },
        ],
      });
      if (!msgRes.ok) {
        const soft = msgRes.status === 403;
        return {
          channel: "discord",
          delivered: false,
          skipped: soft
            ? "recipient has DMs closed"
            : `send failed: ${msgRes.status}`,
        };
      }
      return { channel: "discord", delivered: true };
    } catch (err: any) {
      logger.warn({ err, rollNo: request.recipient.rollNo }, "Discord DM failed");
      return { channel: "discord", delivered: false, skipped: "request threw" };
    }
  },
};
