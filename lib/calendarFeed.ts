// lib/calendarFeed.ts
// Signed, per-member iCalendar feed. Calendar clients can't send a bearer
// token, so the credential has to live in the URL — an HMAC over the member id
// keeps it unguessable and lets the server verify it without storing anything.
import { createHmac, timingSafeEqual } from "crypto";
import { ARIZONA_ZONE } from "@/lib/recurrence";

const FEED_TOKEN_PREFIX = "calendar-feed-v1";
const DEFAULT_SECRET = "default-checkin-secret";

function getSecret() {
  return (
    process.env.CALENDAR_FEED_SECRET ||
    process.env.CHECKIN_CODE_SECRET ||
    process.env.INVITE_SECRET ||
    DEFAULT_SECRET
  );
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(memberId: string) {
  const hmac = createHmac("sha256", getSecret());
  hmac.update(`${FEED_TOKEN_PREFIX}|${memberId}`);
  return base64UrlEncode(hmac.digest());
}

/// `<memberId>.<signature>` — the id has to travel with the signature so the
/// feed knows whose calendar to build.
export function createFeedToken(memberId: string) {
  return `${memberId}.${sign(memberId)}`;
}

export function verifyFeedToken(token: string): string | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const memberId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(memberId);
  // Constant-time so the signature can't be recovered a byte at a time.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? memberId : null;
}

/// RFC 5545 wants UTC stamps as `YYYYMMDDTHHMMSSZ`.
function formatUTC(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/// Long lines must be folded at 75 octets, continued with a leading space.
function fold(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length) {
    parts.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

function escapeText(value: string) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export interface FeedEvent {
  _id: any;
  name?: string;
  description?: string;
  location?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  status?: string;
  eventType?: string;
  updatedAt?: Date | string;
}

export function buildICS(events: FeedEvent[], calendarName = "Theta Tau ΔΓ") {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Theta Tau Delta Gamma//Chapter Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${ARIZONA_ZONE}`,
    // Tells subscribers how often to re-poll. Most clients honour it loosely.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    const start = event.startTime ? new Date(event.startTime) : null;
    const end = event.endTime ? new Date(event.endTime) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const finish =
      end && !Number.isNaN(end.getTime())
        ? end
        : new Date(start.getTime() + 60 * 60 * 1000);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event._id?.toString?.() ?? String(event._id)}@thetatau-dg.org`);
    lines.push(`DTSTAMP:${formatUTC(new Date(event.updatedAt ?? Date.now()))}`);
    lines.push(`DTSTART:${formatUTC(start)}`);
    lines.push(`DTEND:${formatUTC(finish)}`);
    lines.push(fold(`SUMMARY:${escapeText(event.name ?? "Chapter event")}`));
    if (event.location) {
      lines.push(fold(`LOCATION:${escapeText(event.location)}`));
    }
    if (event.description) {
      lines.push(fold(`DESCRIPTION:${escapeText(event.description)}`));
    }
    // A cancelled event has to stay in the feed as CANCELLED — dropping it
    // would leave a stale copy sitting in every subscriber's calendar.
    lines.push(`STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
    if (event.eventType) {
      lines.push(`CATEGORIES:${escapeText(event.eventType.toUpperCase())}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
