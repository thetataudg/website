// lib/availability/solve.ts
// The ranker. A pure function, no DB, so it is unit-testable in isolation.
//
//   solve(poll, existingEvents, options) -> RankedSlot[]
//
// For every start where the meeting fits inside one day's window:
//   1. Hard-block: discard it if it overlaps a scheduled/ongoing Event that is
//      chapter-wide or belongs to this poll's committee. Recurring events are
//      expanded across the window rather than read as stored occurrences.
//   2. Score: how many invitees are free for *every* slot the meeting covers.
//   3. Weekly bonus: if the same weekday+time also scores well on the other
//      dates in the window, nudge it up and mark `repeatsWeekly`, so the head
//      can see "this works every Tuesday". (Not applied in weekday mode, where
//      every column already *is* a weekday.)
//   4. Tiebreak: earlier in the term, then earlier in the day.
//
// Two shapes of poll:
//   - dateMode "dates":    columns are concrete Phoenix days.
//   - dateMode "weekdays":  columns are weekday numbers (1..7), no year. The
//     candidate's time is checked against a rolling few weeks of the calendar
//     so a standing slot still can't land on the recurring chapter meeting.
import { DateTime } from "luxon";
import { ARIZONA_ZONE } from "@/lib/recurrence";

export interface SolvePollInput {
  /// "dates" (default) or "weekdays".
  dateMode?: string;
  dates: string[];
  /// 1..7 (Mon..Sun) when dateMode === "weekdays".
  weekdays?: number[];
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
  meetingMinutes: number;
  invitees: Array<{ memberId: string }>;
  responses: Array<{ memberId: string; slots: number[] }>;
  /// Null / undefined for a chapter-wide poll.
  committeeId?: string | null;
}

export interface SolveEventInput {
  startTime: Date | string;
  endTime: Date | string;
  status?: string;
  /// Null / undefined means chapter-wide.
  committeeId?: string | null;
  recurrence?: {
    enabled?: boolean;
    frequency?: "daily" | "weekly" | "monthly";
    interval?: number;
    endDate?: Date | string | null;
    count?: number | null;
  } | null;
}

export interface RankedSlot {
  /// Column index into `dates` or `weekdays`.
  dateIndex: number;
  slotIndex: number;
  /// "2026-09-14" in dates mode; "" in weekday mode.
  date: string;
  /// 1..7 (Mon..Sun). Always set.
  weekday: number;
  /// Minutes from midnight, Phoenix.
  startMinute: number;
  /// Phoenix wall time as an ISO string with offset, ready to hand to the
  /// event-create path. In weekday mode this is the next upcoming occurrence
  /// of that weekday+time, as a sensible default the head can change.
  startISO: string;
  endISO: string;
  /// Invitees free for the whole meeting.
  score: number;
  availableMemberIds: string[];
  /// Everyone who was asked and is *not* free for the whole meeting, including
  /// the ones who never answered. The head needs to see who they'd exclude,
  /// not just a count.
  missingMemberIds: string[];
  repeatsWeekly: boolean;
  /// The weakest week's score, when `repeatsWeekly`. Undefined otherwise.
  weeklyWorstScore?: number;
}

export interface SolveOptions {
  /// How many ranked options to return. Default 5.
  limit?: number;
  /// How much of one invitee a clean weekly repeat is worth in the ranking.
  /// Default 0.5, so a repeat breaks ties without overriding a genuinely
  /// better one-off.
  weeklyBonus?: number;
  /// Minimum score, as a fraction of invitees, for a week to count toward a
  /// weekly repeat. Default 0.5 (a simple majority).
  weeklyThreshold?: number;
  /// Override "now" for tests. Drops past candidates (dates mode) and anchors
  /// the rolling window (weekday mode).
  now?: Date;
}

const BLOCKING_STATUSES = new Set(["scheduled", "ongoing"]);
const MAX_OCCURRENCES = 500;
/// How far ahead a weekday-mode poll checks the real calendar for clashes.
const WEEKDAY_HORIZON_WEEKS = 8;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventAppliesToPoll(
  event: SolveEventInput,
  pollCommitteeId?: string | null
): boolean {
  if (!BLOCKING_STATUSES.has(event.status ?? "scheduled")) return false;
  const eventCommittee = event.committeeId ? String(event.committeeId) : null;
  if (!eventCommittee) return true;
  return !!pollCommitteeId && eventCommittee === String(pollCommitteeId);
}

function expandOccurrences(
  event: SolveEventInput,
  windowStart: number,
  windowEnd: number
): Array<[number, number]> {
  const start = toDate(event.startTime);
  const end = toDate(event.endTime);
  if (!start || !end) return [];

  const baseStart = start.getTime();
  const baseEnd = end.getTime();
  const durationMs = Math.max(baseEnd - baseStart, 0);

  const rec = event.recurrence;
  if (!rec?.enabled) {
    if (baseStart < windowEnd && windowStart < baseEnd) {
      return [[baseStart, baseEnd]];
    }
    return [];
  }

  const frequency = rec.frequency || "weekly";
  const interval = Math.max(Number(rec.interval) || 1, 1);
  const endDate = toDate(rec.endDate ?? null);
  const hardCount =
    rec.count && Number(rec.count) > 0 ? Number(rec.count) : Infinity;

  const out: Array<[number, number]> = [];
  let cursor = DateTime.fromMillis(baseStart, { zone: ARIZONA_ZONE });
  let produced = 0;

  for (let i = 0; i < MAX_OCCURRENCES && produced < hardCount; i += 1) {
    const occStart = cursor.toMillis();
    const occEnd = occStart + durationMs;
    if (endDate && occStart > endDate.getTime()) break;
    if (occStart >= windowEnd) break;
    if (occStart < windowEnd && windowStart < occEnd) {
      out.push([occStart, occEnd]);
    }
    produced += 1;
    if (frequency === "daily") {
      cursor = cursor.plus({ days: interval });
    } else if (frequency === "monthly") {
      cursor = cursor.plus({ months: interval });
    } else {
      cursor = cursor.plus({ weeks: interval });
    }
  }
  return out;
}

/// The grid, and where each cell falls in wall-clock time.
export function gridShape(poll: SolvePollInput) {
  const span = poll.dayEndMinute - poll.dayStartMinute;
  const slotsPerDay = Math.max(Math.floor(span / poll.slotMinutes), 0);
  const slotsNeeded = Math.max(
    Math.ceil(poll.meetingMinutes / poll.slotMinutes),
    1
  );
  return { slotsPerDay, slotsNeeded };
}

/// The columns of a poll's grid, as luxon days. In dates mode these are the
/// literal days; in weekday mode each is the next upcoming date for that
/// weekday, anchored on `now`.
function columnDays(poll: SolvePollInput, now: DateTime): DateTime[] {
  if (poll.dateMode === "weekdays") {
    return (poll.weekdays ?? []).map((wd) => {
      let d = now.startOf("day");
      // luxon weekday: 1 = Monday .. 7 = Sunday, same as ours.
      const delta = (wd - d.weekday + 7) % 7;
      return d.plus({ days: delta });
    });
  }
  return poll.dates.map((iso) => DateTime.fromISO(iso, { zone: ARIZONA_ZONE }));
}

export function solve(
  poll: SolvePollInput,
  existingEvents: SolveEventInput[] = [],
  options: SolveOptions = {}
): RankedSlot[] {
  const limit = options.limit ?? 5;
  const weeklyBonus = options.weeklyBonus ?? 0.5;
  const weeklyThreshold = options.weeklyThreshold ?? 0.5;
  const now = DateTime.fromJSDate(options.now ?? new Date()).setZone(
    ARIZONA_ZONE
  );
  const nowMs = now.toMillis();
  const isWeekday = poll.dateMode === "weekdays";

  const { slotsPerDay, slotsNeeded } = gridShape(poll);
  const inviteeIds = poll.invitees.map((i) => String(i.memberId));
  const inviteeCount = inviteeIds.length;

  const days = columnDays(poll, now).filter((d) => d.isValid);
  if (!slotsPerDay || slotsNeeded > slotsPerDay || days.length === 0) {
    return [];
  }

  const freeBy = new Map<string, Set<number>>();
  for (const resp of poll.responses) {
    const id = String(resp.memberId);
    if (!inviteeIds.includes(id)) continue;
    freeBy.set(id, new Set(resp.slots));
  }

  // The window recurring-event expansion has to cover.
  const windowStart = isWeekday
    ? now.startOf("day").toMillis()
    : days[0].plus({ minutes: poll.dayStartMinute }).toMillis();
  const windowEnd = isWeekday
    ? now.plus({ weeks: WEEKDAY_HORIZON_WEEKS }).toMillis()
    : days[days.length - 1].plus({ minutes: poll.dayEndMinute }).toMillis();

  const blockers: Array<[number, number]> = [];
  for (const event of existingEvents) {
    if (!eventAppliesToPoll(event, poll.committeeId)) continue;
    blockers.push(...expandOccurrences(event, windowStart, windowEnd));
  }

  const overlapsBlocker = (startMs: number, endMs: number) =>
    blockers.some(([bs, be]) => startMs < be && bs < endMs);

  interface Candidate {
    dateIndex: number;
    slotIndex: number;
    date: string;
    weekday: number;
    startMinute: number;
    startISO: string;
    endISO: string;
    blocked: boolean;
    score: number;
    availableMemberIds: string[];
    missingMemberIds: string[];
  }

  const candidates: Candidate[] = [];
  const lastStartSlot = slotsPerDay - slotsNeeded;

  for (let dateIndex = 0; dateIndex < days.length; dateIndex += 1) {
    const day = days[dateIndex];

    for (let slotIndex = 0; slotIndex <= lastStartSlot; slotIndex += 1) {
      const startMinute = poll.dayStartMinute + slotIndex * poll.slotMinutes;
      const start = day.plus({ minutes: startMinute });
      const end = start.plus({ minutes: poll.meetingMinutes });

      let blocked: boolean;
      if (isWeekday) {
        // Check this weekday+time against the next several weeks so a standing
        // slot still dodges the recurring chapter meeting.
        blocked = false;
        for (let w = 0; w < WEEKDAY_HORIZON_WEEKS; w += 1) {
          const s = start.plus({ weeks: w });
          if (s.toMillis() < nowMs) continue;
          if (overlapsBlocker(s.toMillis(), s.plus({ minutes: poll.meetingMinutes }).toMillis())) {
            blocked = true;
            break;
          }
        }
      } else {
        blocked =
          end.toMillis() <= nowMs ||
          overlapsBlocker(start.toMillis(), end.toMillis());
      }

      const covered: number[] = [];
      for (let k = 0; k < slotsNeeded; k += 1) {
        covered.push(dateIndex * slotsPerDay + (slotIndex + k));
      }

      const availableMemberIds: string[] = [];
      const missingMemberIds: string[] = [];
      for (const id of inviteeIds) {
        const free = freeBy.get(id);
        const ok = !!free && covered.every((idx) => free.has(idx));
        if (ok) availableMemberIds.push(id);
        else missingMemberIds.push(id);
      }

      candidates.push({
        dateIndex,
        slotIndex,
        date: isWeekday ? "" : day.toFormat("yyyy-MM-dd"),
        weekday: day.weekday,
        startMinute,
        startISO: start.toISO() ?? "",
        endISO: end.toISO() ?? "",
        blocked,
        score: availableMemberIds.length,
        availableMemberIds,
        missingMemberIds,
      });
    }
  }

  // Weekly-repeat detection — dates mode only. In weekday mode every column is
  // already a recurring weekday, so the bonus would just apply to everything.
  const weeklyWorstByKey = new Map<string, number>();
  if (!isWeekday) {
    const groups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      if (c.blocked) continue;
      const key = `${c.weekday}:${c.startMinute}`;
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    const thresholdScore = Math.ceil(weeklyThreshold * inviteeCount);
    for (const [key, arr] of groups) {
      if (arr.length < 2) continue;
      const worst = Math.min(...arr.map((c) => c.score));
      if (worst >= thresholdScore && worst > 0) {
        weeklyWorstByKey.set(key, worst);
      }
    }
  }

  const ranked = candidates
    .filter((c) => !c.blocked)
    .map((c) => {
      const key = `${c.weekday}:${c.startMinute}`;
      const weeklyWorst = weeklyWorstByKey.get(key);
      const repeatsWeekly = weeklyWorst !== undefined;
      const effectiveScore = c.score + (repeatsWeekly ? weeklyBonus : 0);
      return { c, effectiveScore, repeatsWeekly, weeklyWorst };
    })
    .sort((a, b) => {
      if (b.effectiveScore !== a.effectiveScore) {
        return b.effectiveScore - a.effectiveScore;
      }
      if (a.c.dateIndex !== b.c.dateIndex) return a.c.dateIndex - b.c.dateIndex;
      return a.c.startMinute - b.c.startMinute;
    })
    .slice(0, limit)
    .map(({ c, repeatsWeekly, weeklyWorst }): RankedSlot => ({
      dateIndex: c.dateIndex,
      slotIndex: c.slotIndex,
      date: c.date,
      weekday: c.weekday,
      startMinute: c.startMinute,
      startISO: c.startISO,
      endISO: c.endISO,
      score: c.score,
      availableMemberIds: c.availableMemberIds,
      missingMemberIds: c.missingMemberIds,
      repeatsWeekly,
      ...(repeatsWeekly ? { weeklyWorstScore: weeklyWorst } : {}),
    }));

  return ranked;
}
