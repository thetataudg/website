"use client";

// Shared client-side glue for the availability poll screens: the API calls, the
// grid math, and the shapes the routes return.
import { DateTime } from "luxon";

export interface PollSummary {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  committeeId?: string | null;
  status: "open" | "closed" | "scheduled" | "cancelled";
  deadline: string;
  dateMode?: "dates" | "weekdays";
  dates: string[];
  weekdays?: number[];
  respondedCount?: number;
  inviteeCount?: number;
  hasResponded?: boolean;
  scheduledEventId?: string | null;
}

export interface PollDetail extends PollSummary {
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
  meetingMinutes: number;
  invitees: Array<{ memberId: string }>;
  responses: Array<{ memberId: string; slots: number[]; source?: string }>;
  reminder: {
    cadenceHours: number;
    escalateToHead: boolean;
    finalCallHours: number;
    maxReminders: number;
  };
}

export interface PollDetailResponse {
  poll: PollDetail;
  members: Array<{ _id: string; name: string }>;
  viewer: { memberId?: string; isManager: boolean; isInvitee: boolean };
  myResponseSlots: number[];
  /// "/member/<committee>/poll/<slug>", or null.
  sharePath: string | null;
  /// "#RRGGBB" — the poll's committee colour.
  accentColor?: string;
}

/** The weekday labels, Mon..Sun keyed 1..7. */
export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export interface RankedSuggestion {
  dateIndex: number;
  slotIndex: number;
  date: string;
  weekday: number;
  startMinute: number;
  startISO: string;
  endISO: string;
  score: number;
  repeatsWeekly: boolean;
  weeklyWorstScore?: number;
  available: Array<{ memberId: string; name: string }>;
  missing: Array<{ memberId: string; name: string }>;
}

/** Grid columns for a poll: concrete days, or bare weekdays. */
export function columnsForPoll(poll: {
  dateMode?: "dates" | "weekdays";
  dates: string[];
  weekdays?: number[];
}): Array<{ key: string; top: string; bottom?: string }> {
  if (poll.dateMode === "weekdays") {
    return (poll.weekdays ?? []).map((wd) => ({
      key: `wd-${wd}`,
      top: (WEEKDAY_LABEL[wd] ?? "").slice(0, 3),
    }));
  }
  return (poll.dates ?? []).map((iso) => {
    const d = DateTime.fromISO(iso);
    return { key: iso, top: d.toFormat("EEE"), bottom: d.toFormat("LLL d") };
  });
}

export function slotsPerDay(poll: {
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
}) {
  return Math.max(
    Math.floor((poll.dayEndMinute - poll.dayStartMinute) / poll.slotMinutes),
    0
  );
}

/// flat index -> list of member names free at that slot.
export function buildHeat(
  poll: PollDetail,
  members: Array<{ _id: string; name: string }>
) {
  const nameById = new Map(members.map((m) => [m._id, m.name]));
  const heat = new Map<number, string[]>();
  for (const r of poll.responses || []) {
    const name = nameById.get(String(r.memberId)) || "Unknown";
    for (const flat of r.slots || []) {
      const arr = heat.get(flat) ?? [];
      arr.push(name);
      heat.set(flat, arr);
    }
  }
  for (const arr of heat.values()) arr.sort();
  return heat;
}

export function deadlineCountdown(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "closed";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

function timeRange(startMinute: number, meetingMinutes: number) {
  const base = DateTime.fromObject({ hour: 0 }).plus({ minutes: startMinute });
  return `${base.toFormat("h:mm a")} – ${base
    .plus({ minutes: meetingMinutes })
    .toFormat("h:mm a")}`;
}

export function fmtSlot(date: string, startMinute: number, meetingMinutes: number) {
  const start = DateTime.fromISO(date).startOf("day").plus({ minutes: startMinute });
  const end = start.plus({ minutes: meetingMinutes });
  return `${start.toFormat("EEE LLL d, h:mm a")} – ${end.toFormat("h:mm a")}`;
}

/** "Sat Sep 14, 5:00 – 6:00 PM" for a dated poll, "Every Tuesday, 5:00 – 6:00 PM" for a weekday one. */
export function fmtSuggestion(s: RankedSuggestion, meetingMinutes: number) {
  if (s.date) return fmtSlot(s.date, s.startMinute, meetingMinutes);
  return `Every ${WEEKDAY_LABEL[s.weekday] ?? "day"}, ${timeRange(
    s.startMinute,
    meetingMinutes
  )}`;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const pollApi = {
  list: () =>
    fetch("/api/availability").then((r) =>
      json<{ waitingOnMe: PollSummary[]; iManage: PollSummary[] }>(r)
    ),
  get: (id: string) =>
    fetch(`/api/availability/${id}`).then((r) => json<PollDetailResponse>(r)),
  create: (payload: any) =>
    fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<PollDetail>(r)),
  saveResponse: (id: string, slots: number[]) =>
    fetch(`/api/availability/${id}/response`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    }).then((r) => json<{ respondedCount: number; inviteeCount: number }>(r)),
  suggestions: (id: string) =>
    fetch(`/api/availability/${id}/suggestions`).then((r) =>
      json<{ inviteeCount: number; suggestions: RankedSuggestion[] }>(r)
    ),
  remind: (id: string) =>
    fetch(`/api/availability/${id}/remind`, { method: "POST" }).then((r) =>
      json<{ reminded: number; skippedCadence: number; outstanding: number }>(r)
    ),
  schedule: (id: string, payload: any) =>
    fetch(`/api/availability/${id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<{ event: any }>(r)),
  patch: (id: string, payload: any) =>
    fetch(`/api/availability/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<PollDetail>(r)),
  cancel: (id: string) =>
    fetch(`/api/availability/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),
};
