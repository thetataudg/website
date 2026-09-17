import type { ComposeSeed, MailDetail } from "./types";

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string, fallback: string): string {
  const source = (name || fallback || "?").replace(/@.*/, "");
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function senderLabel(m: { direction: "in" | "out"; fromName: string; from: string; to: string[] }): string {
  if (m.direction === "out") return `To: ${m.to.join(", ") || "(no recipients)"}`;
  return m.fromName || m.from;
}

function prefixed(prefix: string, subject: string) {
  const s = subject && subject !== "(no subject)" ? subject : "";
  return new RegExp(`^${prefix}:`, "i").test(s) ? s : `${prefix}: ${s}`.trim();
}

export function replySeed(m: MailDetail, ownAddress: string, all: boolean): ComposeSeed {
  const own = ownAddress.toLowerCase();
  const primary = m.direction === "out" ? m.to : m.replyTo.length ? m.replyTo : [m.from];
  const cc = all
    ? Array.from(new Set([...(m.direction === "out" ? [] : m.to), ...m.cc]))
        .filter((a) => a.toLowerCase() !== own && !primary.includes(a))
    : [];
  return {
    mode: all ? "replyAll" : "reply",
    to: primary,
    cc,
    subject: prefixed("Re", m.subject),
    replyToId: m.id,
    quoted: m,
  };
}

export function forwardSeed(m: MailDetail): ComposeSeed {
  return {
    mode: "forward",
    subject: prefixed("Fwd", m.subject),
    forwardOfId: m.id,
    quoted: m,
    forwardAttachments: m.attachments.filter((a) => !a.inline && a.state === "ready"),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/// A single editable draft containing several selected messages. We use the
/// plain-text bodies so opening the composer never loads a sender's trackers.
export function bulkForwardSeed(messages: MailDetail[]): ComposeSeed {
  const sections = messages.map((m) => {
    const from = m.fromName ? `${m.fromName} <${m.from}>` : m.from;
    const rows = [
      ["From", from],
      ["Date", fullDate(m.date)],
      ["Subject", m.subject],
      ["To", m.to.join(", ")],
      ...(m.cc.length ? [["Cc", m.cc.join(", ")]] : []),
    ];
    const body = (m.text || m.snippet || "(This message has no text.)").trim();
    const text = `---------- Forwarded message ---------\n${rows.map(([key, value]) => `${key}: ${value}`).join("\n")}\n\n${body}`;
    const html =
      `<div><strong>---------- Forwarded message ---------</strong><br>` +
      `${rows.map(([key, value]) => `<strong>${key}:</strong> ${escapeHtml(value)}<br>`).join("")}` +
      `<br><div style="white-space:pre-wrap">${escapeHtml(body)}</div></div>`;
    return { text, html };
  });

  return {
    mode: "new",
    subject: messages.length === 1 ? prefixed("Fwd", messages[0].subject) : `Fwd: ${messages.length} messages`,
    text: sections.map((section) => section.text).join("\n\n"),
    html: sections.map((section) => section.html).join("<br><hr><br>"),
  };
}
