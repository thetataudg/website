// lib/rush/format.ts
// Pure helpers for the public page: Phoenix labels, the remaining-events
// filter and URL validation. No database, so `npm run check:rush` runs them.
import { DateTime } from "luxon";
import { DEFAULT_POSTER_SRC } from "./defaults";
import type { RushEventView, RushPageData, RushPageView } from "./types";

export const RUSH_ZONE = "America/Phoenix";

/// An event stays in "Remaining events" until three hours after it starts, so
/// one in progress is still listed.
export const IN_PROGRESS_GRACE_MS = 3 * 60 * 60 * 1000;

export function rushEventLabel(startsAt: string | Date): string {
  const dt = DateTime.fromJSDate(new Date(startsAt)).setZone(RUSH_ZONE);
  return `${dt.toFormat("LLLL d")} · ${dt.toFormat("h:mm a")}`;
}

export function sortEvents<T extends { startsAt: string }>(events: T[]): T[] {
  return [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
}

export function remainingEvents<T extends { startsAt: string }>(
  events: T[],
  now: Date = new Date()
): T[] {
  const cutoff = now.getTime() - IN_PROGRESS_GRACE_MS;
  return sortEvents(events).filter((e) => new Date(e.startsAt).getTime() > cutoff);
}

export function isValidInterestUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function posterSrcFor(key: string | null | undefined): string {
  return key ? `/api/rush/poster/${key.split("/").map(encodeURIComponent).join("/")}` : DEFAULT_POSTER_SRC;
}

/// The doc (or defaults) as the public page needs it: hidden events dropped,
/// sorted, dates formatted in Phoenix.
export function toRushView(data: RushPageData): RushPageView {
  const events: RushEventView[] = sortEvents(
    (data.events || []).filter((e) => !e.hidden)
  ).map((e, index) => ({
    key: e._id || `${e.title}-${e.startsAt}-${index}`,
    title: e.title,
    startsAt: new Date(e.startsAt).toISOString(),
    label: rushEventLabel(e.startsAt),
    location: e.location,
    featuring: e.featuring || undefined,
  }));
  const { events: _events, poster, ...rest } = data;
  return {
    ...rest,
    events,
    posterSrc: poster?.hidden ? null : posterSrcFor(poster?.key),
    posterWidth: poster?.key ? poster.width || 1080 : 1080,
    posterHeight: poster?.key ? poster.height || 1350 : 1350,
    posterAlt: poster?.alt || "Rush flyer",
  };
}
