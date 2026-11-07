// lib/tasks/logic.ts
// The tracker's rules as pure functions: keys, stale and overdue math in
// Phoenix, the bug status mapping, board ordering and mentions. No database,
// so `npm run check:tasks` exercises all of it.
import { DateTime } from "luxon";
import {
  DUE_SOON_HOURS,
  QUIET_AFTER_HOUR,
  QUIET_BEFORE_HOUR,
  STALE_AMBER_DAYS,
  STALE_NUDGE_REPEAT_DAYS,
  STALE_RED_DAYS,
  STATUS_GROUP,
  TASK_ZONE,
  type TaskStatus,
} from "./constants";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- keys

/// Every task key reads `TTDG-XXXX`: the chapter prefix and a random
/// four-character code, unique across all committees.
export const TASK_KEY_PREFIX = "TTDG";
/// No 0/O or 1/I, so a key read aloud or retyped survives.
export const TASK_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newTaskCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += TASK_CODE_ALPHABET[Math.floor(random() * TASK_CODE_ALPHABET.length)];
  return code;
}

export function taskKey(task: { code?: string | null }): string {
  return `${TASK_KEY_PREFIX}-${task?.code || "----"}`;
}

/// "ttdg-7k2m" or "7K2M" → { code: "7K2M" }, or null.
export function parseTaskKey(key: string): { code: string } | null {
  const match = /^(?:TTDG-)?([A-Z0-9]{4})$/i.exec((key || "").trim());
  if (!match) return null;
  return { code: match[1].toUpperCase() };
}

// ---------------------------------------------------------------- dates

/// An all-day due date is stored as 23:59 Phoenix on that day.
export function allDayDueAt(isoDate: string): Date {
  const dt = DateTime.fromISO(isoDate, { zone: TASK_ZONE }).set({
    hour: 23,
    minute: 59,
    second: 0,
    millisecond: 0,
  });
  return dt.toJSDate();
}

export function phoenixDay(date: Date): string {
  return DateTime.fromJSDate(date).setZone(TASK_ZONE).toISODate() || "";
}

/// "Nov 12", or "Nov 12, 3:00 PM" for a timed due date. Phoenix.
export function dueLabel(dueAt: Date, allDay = true): string {
  const dt = DateTime.fromJSDate(dueAt).setZone(TASK_ZONE);
  return allDay ? dt.toFormat("LLL d") : dt.toFormat("LLL d, h:mm a");
}

export type DueState = "overdue" | "today" | "soon" | null;

/// Inside the "due soon" window: for an all-day task, from the start of the
/// Phoenix day before it is due ("due tomorrow"); for a timed one, the last
/// DUE_SOON_HOURS.
export function inDueSoonWindow(
  task: { dueAt?: Date | string | null; dueAllDay?: boolean },
  now: Date
): boolean {
  if (!task.dueAt) return false;
  const due = new Date(task.dueAt);
  if (due.getTime() <= now.getTime()) return false;
  if (task.dueAllDay !== false) {
    const dayBefore = DateTime.fromJSDate(due).setZone(TASK_ZONE).minus({ days: 1 }).toISODate() || "";
    return phoenixDay(now) >= dayBefore;
  }
  return due.getTime() - now.getTime() <= DUE_SOON_HOURS * 3_600_000;
}

/// Calendar-day questions answered in Phoenix. "today" for an all-day task
/// is the whole Phoenix day; a timed task is overdue the moment it passes.
export function dueState(
  task: { dueAt?: Date | string | null; dueAllDay?: boolean; status?: TaskStatus },
  now: Date
): DueState {
  if (!task.dueAt || !isOpen(task.status)) return null;
  const due = new Date(task.dueAt);
  if (due.getTime() < now.getTime()) return "overdue";
  if (phoenixDay(due) === phoenixDay(now)) return "today";
  if (inDueSoonWindow(task, now)) return "soon";
  return null;
}

export type StaleLevel = "amber" | "red" | null;

/// Whole days since the last activity, for a task in a started status.
export function staleDays(
  task: { status?: TaskStatus; lastActivityAt?: Date | string | null },
  now: Date
): number {
  if (!task.status || STATUS_GROUP[task.status] !== "started" || !task.lastActivityAt) return 0;
  return Math.floor((now.getTime() - new Date(task.lastActivityAt).getTime()) / DAY_MS);
}

export function staleLevel(
  task: { status?: TaskStatus; lastActivityAt?: Date | string | null },
  now: Date
): StaleLevel {
  const days = staleDays(task, now);
  if (days >= STALE_RED_DAYS) return "red";
  if (days >= STALE_AMBER_DAYS) return "amber";
  return null;
}

export function isOpen(status?: TaskStatus | null): boolean {
  if (!status) return false;
  const group = STATUS_GROUP[status];
  return group === "unstarted" || group === "started";
}

/// 8am to 9pm Phoenix is when reminders may go out.
export function isQuietHours(now: Date): boolean {
  const hour = DateTime.fromJSDate(now).setZone(TASK_ZONE).hour;
  return hour < QUIET_BEFORE_HOUR || hour >= QUIET_AFTER_HOUR;
}

// ---------------------------------------------------------------- reminders

export interface ReminderState {
  dueSoonSentAt?: Date | string | null;
  overdueSentAt?: Date | string | null;
  staleSentAt?: Date | string | null;
}

export interface ReminderTask {
  status: TaskStatus;
  dueAt?: Date | string | null;
  dueAllDay?: boolean;
  lastActivityAt?: Date | string | null;
  assigneeIds?: unknown[];
  reminderState?: ReminderState | null;
  archivedAt?: Date | string | null;
}

export type ReminderKind = "due_soon" | "overdue" | "stale";

/// Which reminders this task is owed right now. Idempotent by construction:
/// once a `*SentAt` stamp is written the same reminder is never owed again
/// (stale repeats only after STALE_NUDGE_REPEAT_DAYS).
export function remindersDue(task: ReminderTask, now: Date): ReminderKind[] {
  if (task.archivedAt || !isOpen(task.status) || !(task.assigneeIds || []).length) return [];
  const state = task.reminderState || {};
  const out: ReminderKind[] = [];

  if (task.dueAt) {
    const due = new Date(task.dueAt);
    const untilDue = due.getTime() - now.getTime();
    if (inDueSoonWindow(task, now) && !state.dueSoonSentAt) {
      out.push("due_soon");
    }
    // Overdue goes once, on the morning after: any time from the Phoenix day
    // after the due day onwards (the cron's quiet hours hold it until 8am).
    if (untilDue < 0 && !state.overdueSentAt && phoenixDay(now) > phoenixDay(due)) {
      out.push("overdue");
    }
  }

  if (staleLevel(task, now)) {
    const last = state.staleSentAt ? new Date(state.staleSentAt) : null;
    const activity = task.lastActivityAt ? new Date(task.lastActivityAt) : null;
    // A nudge sent before the most recent activity belongs to an earlier
    // stale spell, so the new spell gets its own first nudge.
    const sameSpell = last && activity && last.getTime() > activity.getTime();
    if (!sameSpell || now.getTime() - last!.getTime() >= STALE_NUDGE_REPEAT_DAYS * DAY_MS) {
      out.push("stale");
    }
  }
  return out;
}

/// True when the weekly digest is due: Monday at or after 9am Phoenix, and not
/// already sent this Phoenix day.
export function digestDue(now: Date, lastSentAt: Date | string | null | undefined, weekday: number, hour: number): boolean {
  const dt = DateTime.fromJSDate(now).setZone(TASK_ZONE);
  if (dt.weekday !== weekday || dt.hour < hour) return false;
  if (!lastSentAt) return true;
  return phoenixDay(new Date(lastSentAt)) !== phoenixDay(now);
}

// ---------------------------------------------------------------- bugs

export const PUBLIC_STATUSES = [
  "received",
  "triaged",
  "in_progress",
  "fixed",
  "wont_fix",
  "duplicate",
  "closed_by_reporter",
] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const PUBLIC_STATUS_LABEL: Record<PublicStatus, string> = {
  received: "Received",
  triaged: "Accepted",
  in_progress: "In progress",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  closed_by_reporter: "Closed",
};

/// What a linked task's status means for the reporter.
export function publicStatusForTask(status: TaskStatus): PublicStatus {
  switch (status) {
    case "backlog":
    case "todo":
      return "triaged";
    case "in_progress":
    case "in_review":
      return "in_progress";
    case "done":
      return "fixed";
    case "canceled":
      return "wont_fix";
  }
}

// ---------------------------------------------------------------- ordering

/// A sort key strictly between two neighbours (fractional indexing). Either
/// side may be missing for the ends of a column.
export function sortBetween(before?: number | null, after?: number | null): number {
  const hasBefore = typeof before === "number" && Number.isFinite(before);
  const hasAfter = typeof after === "number" && Number.isFinite(after);
  if (hasBefore && hasAfter) return (before! + after!) / 2;
  if (hasBefore) return before! + 1024;
  if (hasAfter) return after! - 1024;
  return 0;
}

// ---------------------------------------------------------------- mentions

/// `@[Name](memberId)` tokens in a comment. The composer inserts that form, so
/// a mention survives two members sharing a first name.
export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  const re = /@\[[^\]]{1,80}\]\(([a-f0-9]{24})\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body || ""))) ids.add(match[1].toLowerCase());
  return Array.from(ids);
}

/// Mentions rendered as plain "@Name", for notification excerpts.
export function plainMentions(body: string): string {
  return (body || "").replace(/@\[([^\]]{1,80})\]\([a-f0-9]{24}\)/gi, "@$1");
}

export function excerpt(body: string, max = 140): string {
  const flat = plainMentions(body).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}...` : flat;
}

// ---------------------------------------------------------------- status times

export interface StatusTimes {
  statusChangedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/// The timestamps a status change implies. Started is kept from the first
/// time work began; completed clears if the task is reopened.
export function statusTimes(
  from: TaskStatus,
  to: TaskStatus,
  current: StatusTimes,
  now: Date
): StatusTimes {
  if (from === to) return current;
  const next: StatusTimes = { ...current, statusChangedAt: now };
  if (STATUS_GROUP[to] === "started" && !current.startedAt) next.startedAt = now;
  if (STATUS_GROUP[to] === "completed" || STATUS_GROUP[to] === "canceled") next.completedAt = now;
  else next.completedAt = null;
  return next;
}
