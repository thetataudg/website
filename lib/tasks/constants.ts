// lib/tasks/constants.ts
// The fixed vocabulary of the committee task tracker. Pure, so the client and
// the checks import it without touching the database.

export const TASK_ZONE = "America/Phoenix";

export const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export type StatusGroup = "unstarted" | "started" | "completed" | "canceled";

export const STATUS_GROUP: Record<TaskStatus, StatusGroup> = {
  backlog: "unstarted",
  todo: "unstarted",
  in_progress: "started",
  in_review: "started",
  done: "completed",
  canceled: "canceled",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  canceled: "Canceled",
};

export const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review"];
export const STARTED_STATUSES: TaskStatus[] = ["in_progress", "in_review"];

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/// Lower sorts first.
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/// A started task with no activity for this many days gets a stale chip.
export const STALE_AMBER_DAYS = 5;
export const STALE_RED_DAYS = 10;

/// After the first stale nudge, at most one more per this many days.
export const STALE_NUDGE_REPEAT_DAYS = 7;

/// Due-soon reminders go out this far ahead.
export const DUE_SOON_HOURS = 24;

/// Weekly digest: Monday (luxon weekday 1) at 9am Phoenix.
export const DIGEST_WEEKDAY = 1;
export const DIGEST_HOUR = 9;

/// Reminders are held outside 8am to 9pm Phoenix.
export const QUIET_BEFORE_HOUR = 8;
export const QUIET_AFTER_HOUR = 21;

export const TAG_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const ACTIVITY_KINDS = [
  "comment",
  "created",
  "status",
  "priority",
  "assignees",
  "due",
  "tags",
  "title",
  "description",
  "checklist",
  "linked_bug",
  "archived",
  "auto_sorted",
  "shared",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
