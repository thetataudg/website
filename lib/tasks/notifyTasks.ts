// lib/tasks/notifyTasks.ts
// Who hears about what on the task tracker. Thin wrappers over `notifyQuietly`:
// a failed push never fails the edit that caused it.
//
// Channels are always explicit. In-app, email and push for everything;
// Discord DMs (opt-in, see lib/notify/channels/discord.ts) only for
// assignments, mentions and the weekly digest. `audit: false` because these
// are not ledger events and must never write a FinanceEvent.
import Member from "@/lib/models/Member";
import { notifyQuietly, recipientFor } from "@/lib/notify";
import type { NotifyTemplate, TemplateContext } from "@/lib/notify/templates";
import { STATUS_LABEL, type TaskStatus } from "./constants";
import { dueLabel, excerpt, taskKey } from "./logic";

export const TASK_CHANNELS = ["email", "push"];
export const TASK_LOUD_CHANNELS = ["email", "push", "discord"];

const str = (value: unknown) => (value == null ? "" : String((value as any)?._id ?? value));
const nameOf = (m: any) => [m?.fName, m?.lName].filter(Boolean).join(" ").trim() || "Someone";

export function taskPath(task: any, committee: any): string {
  const key = taskKey(task);
  const base = `/member/tech/${encodeURIComponent(key)}`;
  return committee?.isTechCommittee ? base : `${base}?committee=${str(committee?._id)}`;
}

export function taskContext(task: any, committee: any, actor?: any): Omit<TemplateContext, "firstName"> {
  return {
    amountCents: 0,
    taskKey: taskKey(task),
    taskTitle: task.title,
    taskPath: taskPath(task, committee),
    committeeName: committee?.name,
    actorName: actor ? nameOf(actor) : undefined,
    taskStatusLabel: STATUS_LABEL[task.status as TaskStatus],
    dueLabel: task.dueAt ? dueLabel(new Date(task.dueAt), task.dueAllDay !== false) : undefined,
  };
}

export async function send(
  memberIds: string[],
  template: NotifyTemplate,
  context: Omit<TemplateContext, "firstName">,
  opts: { channels?: string[]; sentBy?: unknown; refs?: Record<string, any> } = {}
) {
  const unique = Array.from(new Set(memberIds.filter(Boolean)));
  for (const id of unique) {
    const recipient = await recipientFor(id).catch(() => null);
    if (!recipient) continue;
    await notifyQuietly({
      recipient,
      template,
      context: { ...context, firstName: recipient.firstName },
      channels: opts.channels ?? TASK_CHANNELS,
      sentBy: opts.sentBy ?? null,
      refs: opts.refs,
      audit: false,
    });
  }
}

export async function assigned(task: any, committee: any, actor: any, memberIds: string[]) {
  if (!memberIds.length) return;
  await send(memberIds, "task_assigned", taskContext(task, committee, actor), {
    channels: TASK_LOUD_CHANNELS,
    sentBy: actor?._id,
    refs: { taskId: str(task._id) },
  });
}

/// The removed assignee hears it; "reassigned to" is in the timeline.
export async function unassigned(task: any, committee: any, actor: any, memberIds: string[], _addedIds: string[]) {
  if (!memberIds.length) return;
  await send(memberIds, "task_unassigned", taskContext(task, committee, actor), {
    sentBy: actor?._id,
    refs: { taskId: str(task._id) },
  });
}

export async function statusChanged(task: any, committee: any, actor: any, _from: TaskStatus, to: TaskStatus) {
  const me = str(actor?._id);
  const ids = new Set<string>();
  if (task.createdBy) ids.add(str(task.createdBy));
  if (to === "in_review" && committee?.committeeHeadId) ids.add(str(committee.committeeHeadId));
  // Urgent tasks always notify their assignees too.
  if (task.priority === "urgent") for (const id of task.assigneeIds || []) ids.add(str(id));
  ids.delete(me);
  await send(Array.from(ids), "task_status_changed", taskContext(task, committee, actor), {
    sentBy: actor?._id,
    refs: { taskId: str(task._id) },
  });
}

export async function commented(task: any, committee: any, actor: any, body: string, mentionIds: string[]) {
  const me = str(actor?._id);
  const context = { ...taskContext(task, committee, actor), commentExcerpt: excerpt(body) };
  const mentioned = mentionIds.filter((id) => id !== me);
  await send(mentioned, "task_mentioned", context, {
    channels: TASK_LOUD_CHANNELS,
    sentBy: actor?._id,
    refs: { taskId: str(task._id) },
  });
  const watchers = new Set<string>((task.assigneeIds || []).map(str));
  if (task.createdBy) watchers.add(str(task.createdBy));
  watchers.delete(me);
  for (const id of mentioned) watchers.delete(id);
  await send(Array.from(watchers), "task_commented", context, {
    sentBy: actor?._id,
    refs: { taskId: str(task._id) },
  });
}

/// For the cron: names for the digest lines.
export async function memberNames(ids: string[]): Promise<Map<string, string>> {
  const members = await Member.find({ _id: { $in: ids } }).select("fName lName").lean<any[]>();
  return new Map(members.map((m) => [str(m._id), nameOf(m)]));
}
