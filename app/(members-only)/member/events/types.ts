import { addRecurrence } from "@/lib/recurrence";

/**
 * The events page's shared vocabulary and the two pieces of arithmetic it
 * needs: turning a recurring parent into the occurrences a date range should
 * show, and turning a list of events into a calendar file.
 */

export interface EventItem {
  _id: string;
  name: string;
  description?: string;
  committeeId?: string | null;
  eventType?: "meeting" | "event" | "chapter";
  recurrence?: {
    enabled?: boolean;
    frequency?: "daily" | "weekly" | "monthly";
    interval?: number;
    endDate?: string | null;
    count?: number;
  };
  recurrenceParentId?: string;
  recurrenceEnabled?: boolean;
  startTime: string;
  endTime: string;
  location?: string;
  /**
   * Whether the event happens in a room or on a call. `location` keeps its
   * meaning under both: a street address for a physical event, the name of the
   * room or channel for a virtual one.
   */
  locationKind?: EventLocationKind;
  virtualPlatform?: VirtualPlatform | null;
  virtualLink?: string;
  gemCategory?: string | null;
  status: string;
  visibleToAlumni: boolean;
}

export type EventLocationKind = "physical" | "virtual";

export type VirtualPlatform = "discord" | "zoom" | "meet" | "teams" | "other";

export const VIRTUAL_PLATFORM_LABEL: Record<VirtualPlatform, string> = {
  discord: "Discord",
  zoom: "Zoom",
  meet: "Google Meet",
  teams: "Microsoft Teams",
  other: "Somewhere else",
};

/**
 * Whether a link is the normal way in. Discord is the exception: the chapter
 * has one server, everybody is already in it, and a channel is a place rather
 * than a URL somebody has to mint each week.
 */
export function platformExpectsLink(platform: VirtualPlatform | null): boolean {
  return platform !== null && platform !== "discord";
}

/**
 * The link, only when it is one a browser can actually open.
 *
 * An officer may type "zoom link coming" into the field, and a button that
 * opens nothing is worse than no button.
 */
export function virtualHref(event: EventItem): string | null {
  const raw = (event.virtualLink || "").trim();
  if (!raw) return null;
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.host) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface Committee {
  _id: string;
  name: string;
  /** A palette key, not a hex value. See `lib/calendarColors.ts`. */
  color?: string | null;
  committeeHeadId?:
    | { _id?: string; fName?: string; lName?: string; rollNo?: string }
    | string;
  committeeMembers?: ({ _id?: string } | string)[];
}

export interface Me {
  role: string;
  status: string;
  memberId: string;
  isCommitteeHead: boolean;
  isECouncil: boolean;
}

export type EventType = NonNullable<EventItem["eventType"]>;

/** An event with no committee is a chapter event; that is what the API means. */
export function resolveEventType(event: EventItem): EventType {
  return event.eventType || (event.committeeId ? "event" : "chapter");
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  meeting: "Meeting",
  event: "Event",
  chapter: "Chapter",
};

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  ongoing: "Happening now",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isRecurring(event: EventItem): boolean {
  return Boolean(
    event.recurrence?.enabled || event.recurrenceEnabled || event.recurrenceParentId
  );
}

export function isPastEvent(event: EventItem, now: Date): boolean {
  if (event.status === "completed") return true;
  return event.status === "scheduled" && new Date(event.endTime) < now;
}

// MARK: - Times

/**
 * Everything is shown in chapter time, not the reader's.
 *
 * A member travelling for a co-op should see the meeting at the hour the room
 * will be sitting in it, which is the one thing a local-time calendar gets
 * reliably wrong.
 */
const CHAPTER_TIME_ZONE = "America/Phoenix";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAPTER_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAPTER_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAPTER_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAPTER_TIME_ZONE,
  month: "long",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAPTER_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const formatDateTime = (value: string | Date) =>
  dateTimeFormatter.format(new Date(value));
export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
export const formatTime = (value: string | Date) => timeFormatter.format(new Date(value));
export const formatMonth = (value: string | Date) => monthFormatter.format(new Date(value));

/** "Aug 23 – Aug 29, 2026" — what a week view calls itself. */
export function formatWeekRange(start: Date, end: Date): string {
  return `${weekdayFormatter.format(start)} – ${weekdayFormatter.format(end)}, ${end.getFullYear()}`;
}

/** "7:00 – 8:30 PM", or the date as well when it runs past midnight. */
export function formatEventWhen(event: EventItem): string {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const sameDay = formatDate(start) === formatDate(end);
  return sameDay
    ? `${formatTime(start)} – ${formatTime(end)}`
    : `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

// MARK: - Recurrence

/**
 * Every occurrence that falls inside a range, including the ones the database
 * has never stored.
 *
 * A recurring event is one row plus a rule; the rows the API returns are the
 * occurrences somebody has since edited or cancelled. Both have to appear, and
 * neither twice — which is what the key set is for.
 */
export function expandOccurrences(
  events: EventItem[],
  rangeStart: Date,
  rangeEnd: Date
): EventItem[] {
  const overlaps = (event: EventItem) =>
    new Date(event.startTime) <= rangeEnd && new Date(event.endTime) >= rangeStart;

  const concrete = events.filter(overlaps);
  const seen = new Set<string>();

  for (const event of concrete) {
    const seriesId =
      event.recurrenceParentId ||
      (event.recurrence?.enabled || event.recurrenceEnabled ? event._id : null);
    seen.add(
      seriesId ? `${seriesId}:${new Date(event.startTime).toISOString()}` : event._id
    );
  }

  const generated: EventItem[] = [];
  const parents = events.filter(
    (event) =>
      (event.recurrence?.enabled || event.recurrenceEnabled) && !event.recurrenceParentId
  );

  for (const parent of parents) {
    const recurrence = parent.recurrence;
    if (!recurrence?.enabled) continue;

    const endDate = recurrence.endDate ? new Date(recurrence.endDate) : null;
    let cursorStart = new Date(parent.startTime);
    let cursorEnd = new Date(parent.endTime);

    // Wind forward to the range rather than generating from the beginning of
    // the series, which for a weekly meeting set up two years ago is a lot of
    // dates nobody asked to see.
    let guard = 0;
    while (cursorEnd < rangeStart && guard < 5000) {
      const next = addRecurrence(cursorStart, cursorEnd, {
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        endDate,
      });
      if (!next) break;
      cursorStart = next.startTime;
      cursorEnd = next.endTime;
      guard += 1;
    }

    while (cursorStart <= rangeEnd && guard < 5000) {
      const key = `${parent._id}:${cursorStart.toISOString()}`;
      if (!seen.has(key)) {
        generated.push({
          ...parent,
          _id: `${parent._id}-${cursorStart.toISOString()}`,
          recurrenceParentId: parent._id,
          startTime: cursorStart.toISOString(),
          endTime: cursorEnd.toISOString(),
        });
      }
      const next = addRecurrence(cursorStart, cursorEnd, {
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        endDate,
      });
      if (!next) break;
      cursorStart = next.startTime;
      cursorEnd = next.endTime;
      guard += 1;
    }
  }

  return [...concrete, ...generated].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

// MARK: - Calendar file

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\;");
}

function icsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** An .ics for the given events, as a string ready to be downloaded. */
export function buildIcs(events: EventItem[]): string {
  const stamp = icsDate(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Delta Gamma//Events//EN"];

  for (const event of events) {
    const uid =
      `${event._id}-${new Date(event.startTime).toISOString()}`.replace(
        /[^a-zA-Z0-9-]/g,
        ""
      ) + "@deltagamma";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(new Date(event.startTime))}`,
      `DTEND:${icsDate(new Date(event.endTime))}`,
      `SUMMARY:${escapeIcs(event.name)}`,
      `DESCRIPTION:${escapeIcs(event.description || "")}`,
      `LOCATION:${escapeIcs(event.location || "")}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
