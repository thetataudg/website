// lib/discordWebhook.ts
// Posting to a Discord incoming webhook. Small on purpose: one function that
// sends an already-built message and tells you honestly whether it landed.
//
// Discord's field limits are hard errors, not truncations, so everything is
// clamped on the way out. A relay that 400s because someone shipped to 27
// territories is a relay nobody trusts.
import logger from "@/lib/logger";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  author?: { name: string; url?: string; icon_url?: string };
}

export interface DiscordMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordPostResult {
  ok: boolean;
  status: number;
  error?: string;
}

/// https://discord.com/developers/docs/resources/message#embed-object-embed-limits
const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footer: 2048,
  authorName: 256,
  content: 2000,
  total: 6000,
};

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/// Bring a message inside every documented limit, including the 6000-character
/// budget shared across an embed's text. Fields are dropped from the end when
/// the budget runs out, since the earlier ones are the ones we chose first.
export function clampDiscordMessage(message: DiscordMessage): DiscordMessage {
  const embeds = (message.embeds ?? []).slice(0, 10).map((embed) => {
    const out: DiscordEmbed = { ...embed };
    if (out.title) out.title = clamp(out.title, LIMITS.title);
    if (out.description) out.description = clamp(out.description, LIMITS.description);
    if (out.footer) out.footer = { ...out.footer, text: clamp(out.footer.text, LIMITS.footer) };
    if (out.author) out.author = { ...out.author, name: clamp(out.author.name, LIMITS.authorName) };

    let budget =
      LIMITS.total -
      (out.title?.length ?? 0) -
      (out.description?.length ?? 0) -
      (out.footer?.text.length ?? 0) -
      (out.author?.name.length ?? 0);

    const fields: DiscordEmbedField[] = [];
    for (const field of (embed.fields ?? []).slice(0, LIMITS.fields)) {
      const name = clamp(field.name, LIMITS.fieldName);
      const value = clamp(field.value, LIMITS.fieldValue);
      const cost = name.length + value.length;
      if (cost > budget) break;
      budget -= cost;
      fields.push({ name, value, inline: field.inline });
    }
    out.fields = fields;
    return out;
  });

  return {
    ...message,
    content: message.content ? clamp(message.content, LIMITS.content) : undefined,
    embeds,
  };
}

/// Send one message. Retries once on a 429, honouring Discord's `retry_after`,
/// and once on a 5xx. Anything else is reported rather than retried, because a
/// 400 will be a 400 next time too.
export async function postDiscordWebhook(
  webhookUrl: string,
  message: DiscordMessage,
  options: { attempts?: number; timeoutMs?: number } = {}
): Promise<DiscordPostResult> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  const body = JSON.stringify(clampDiscordMessage(message));

  let last: DiscordPostResult = { ok: false, status: 0, error: "not attempted" };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      if (res.ok) return { ok: true, status: res.status };

      const text = await res.text().catch(() => "");
      last = { ok: false, status: res.status, error: text.slice(0, 500) };

      if (res.status === 429 && attempt < attempts) {
        let waitMs = 1000;
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed.retry_after === "number") {
            // Discord reports seconds on the webhook route.
            waitMs = Math.min(Math.ceil(parsed.retry_after * 1000), 10_000);
          }
        } catch {
          /* fall back to the flat second */
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (res.status >= 500 && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }

      return last;
    } catch (err: any) {
      last = { ok: false, status: 0, error: err?.message || "request failed" };
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  logger.error({ status: last.status, error: last.error }, "Discord webhook post failed");
  return last;
}
