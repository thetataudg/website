// lib/tasks/cron.ts
// The tracker's reminders: due soon, overdue, stale nudges and the Monday
// digest. Run from the in-process ticker (lib/eventScheduler.ts) every 15
// minutes, and optionally from the secret-guarded /api/tasks/cron route.
//
// Idempotent by construction. Each reminder is claimed with a conditional
// update on its `reminderState` stamp before anything is sent, so a second
// run, a second container during a rolling deploy, or a manual trigger in the
// same minute sends nothing new. Nothing goes out between 9pm and 8am Phoenix.
import { DateTime } from "luxon";
import Committee from "@/lib/models/Committee";
import Task from "@/lib/models/Task";
import logger from "@/lib/logger";
import {
  DIGEST_HOUR,
  DIGEST_WEEKDAY,
  OPEN_STATUSES,
  STALE_NUDGE_REPEAT_DAYS,
  STATUS_LABEL,
  TASK_ZONE,
  type TaskStatus,
} from "./constants";
import {
  digestDue,
  isQuietHours,
  remindersDue,
  staleDays,
  type ReminderKind,
} from "./logic";
import { memberNames, send, taskContext, TASK_LOUD_CHANNELS } from "./notifyTasks";
import { buildDigest } from "./digest";

export interface TasksCronReport {
  ran: boolean;
  reason?: string;
  dueSoon: number;
  overdue: number;
  stale: number;
  digests: number;
}

const STAMP: Record<ReminderKind, string> = {
  due_soon: "reminderState.dueSoonSentAt",
  overdue: "reminderState.overdueSentAt",
  stale: "reminderState.staleSentAt",
};

/// Claims one reminder for one task. True only for the run that wins.
async function claim(task: any, kind: ReminderKind, now: Date): Promise<boolean> {
  const field = STAMP[kind];
  const previous = task.reminderState?.[field.split(".")[1]] ?? null;
  const condition =
    kind === "stale" && previous
      ? { [field]: previous } // repeat nudge: only if nobody stamped it since we read it
      : { [field]: null };
  const result = await Task.updateOne({ _id: task._id, ...condition }, { $set: { [field]: now } });
  return result.modifiedCount === 1;
}

export async function runTasksCron(now: Date = new Date()): Promise<TasksCronReport> {
  const report: TasksCronReport = { ran: false, dueSoon: 0, overdue: 0, stale: 0, digests: 0 };
  if (isQuietHours(now)) return { ...report, reason: "quiet hours" };
  report.ran = true;

  const tasks = await Task.find({
    archivedAt: null,
    status: { $in: OPEN_STATUSES },
    "assigneeIds.0": { $exists: true },
  }).lean<any[]>();
  const committees = new Map<string, any>(
    (
      await Committee.find({ _id: { $in: Array.from(new Set(tasks.map((t) => String(t.committeeId)))) } }).lean<any[]>()
    ).map((c) => [String(c._id), c])
  );

  for (const task of tasks) {
    const committee = committees.get(String(task.committeeId));
    if (!committee) continue;
    for (const kind of remindersDue(task, now)) {
      // A stale repeat is only owed weekly; remindersDue already checked the
      // gap, the claim makes it single-shot.
      if (!(await claim(task, kind, now))) continue;
      const assignees = (task.assigneeIds || []).map(String);
      const context = taskContext(task, committee);
      try {
        if (kind === "due_soon") {
          await send(assignees, "task_due_soon", {
            ...context,
            dueLabel: dueSoonLabel(task, now),
          });
          report.dueSoon += 1;
        } else if (kind === "overdue") {
          await send(assignees, "task_overdue", context);
          report.overdue += 1;
        } else {
          await send(assignees, "task_stale", {
            ...context,
            staleDays: staleDays(task, now),
            taskStatusLabel: STATUS_LABEL[task.status as TaskStatus],
          });
          report.stale += 1;
        }
      } catch (err: any) {
        logger.warn({ err, taskId: String(task._id), kind }, "Task reminder failed after claim");
      }
    }
  }

  report.digests = await sendDigests(now);
  return report;
}

/// "tomorrow", "today at 3:00 PM", "Nov 12". Phoenix.
function dueSoonLabel(task: any, now: Date): string {
  const due = DateTime.fromJSDate(new Date(task.dueAt)).setZone(TASK_ZONE);
  const today = DateTime.fromJSDate(now).setZone(TASK_ZONE).startOf("day");
  const days = Math.round(due.startOf("day").diff(today, "days").days);
  const time = task.dueAllDay !== false ? "" : ` at ${due.toFormat("h:mm a")}`;
  if (days <= 0) return `today${time}`;
  if (days === 1) return `tomorrow${time}`;
  return `${due.toFormat("LLL d")}${time}`;
}

// ------------------------------------------------------------------ digest

async function sendDigests(now: Date): Promise<number> {
  const phoenix = DateTime.fromJSDate(now).setZone(TASK_ZONE);
  if (phoenix.weekday !== DIGEST_WEEKDAY || phoenix.hour < DIGEST_HOUR) return 0;
  const startOfDay = phoenix.startOf("day").toJSDate();

  const committeeIds = await Task.distinct("committeeId", { archivedAt: null });
  let sent = 0;
  for (const committeeId of committeeIds) {
    const committee = await Committee.findById(committeeId).lean<any>();
    if (!committee?.committeeHeadId) continue;
    if (!digestDue(now, committee.taskDigestSentAt, DIGEST_WEEKDAY, DIGEST_HOUR)) continue;
    const claimed = await Committee.updateOne(
      {
        _id: committee._id,
        $or: [{ taskDigestSentAt: null }, { taskDigestSentAt: { $lt: startOfDay } }],
      },
      { $set: { taskDigestSentAt: now } }
    );
    if (claimed.modifiedCount !== 1) continue;

    const tasks = await Task.find({ committeeId: committee._id, archivedAt: null }).lean<any[]>();
    const ids = Array.from(new Set(tasks.flatMap((t) => (t.assigneeIds || []).map(String))));
    const digest = buildDigest({ committee, tasks, names: await memberNames(ids), now });
    await send(
      [String(committee.committeeHeadId)],
      "task_digest",
      {
        amountCents: 0,
        committeeName: committee.name,
        digestOverdue: digest.overdue,
        digestStale: digest.stale,
        digestDone: digest.done,
        digestLines: digest.lines,
      },
      { channels: TASK_LOUD_CHANNELS }
    );
    sent += 1;
  }
  return sent;
}

export { STALE_NUDGE_REPEAT_DAYS };
