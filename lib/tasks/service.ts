// lib/tasks/service.ts
// Everything the task tracker does, in one place. API routes, MCP tools and
// the cron all call this, so a rule (who may edit, what writes activity, who
// is told) can only be wrong once.
//
// Every mutation: re-checks access, writes a TaskActivity row per changed
// field, bumps `lastActivityAt`, keeps the status timestamps right, publishes
// a live "tasks" event to the committee, and hands notifications to
// notifyTasks.ts (which never fails the change it describes).
import { randomBytes } from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import Task from "@/lib/models/Task";
import TaskActivity from "@/lib/models/TaskActivity";
import TaskTag from "@/lib/models/TaskTag";
import { getTechCommittee } from "@/lib/committeeQueries";
import { publishLive } from "@/lib/live";
import logger from "@/lib/logger";
import { badRequest, forbidden, notFound } from "@/lib/httpError";
import {
  OPEN_STATUSES,
  PRIORITIES,
  STATUSES,
  STATUS_GROUP,
  TAG_COLORS,
  type ActivityKind,
  type TaskPriority,
  type TaskStatus,
} from "./constants";
import {
  allDayDueAt,
  dueLabel,
  dueState,
  parseMentions,
  newTaskCode,
  parseTaskKey,
  sortBetween,
  staleDays,
  staleLevel,
  statusTimes,
  taskKey,
  TASK_KEY_PREFIX,
} from "./logic";
import { assertTrackerAccess, canManageTracker, canViewTracker } from "./permissions";
import * as notifyTasks from "./notifyTasks";

type Actor = any;
type Id = string;

const oid = (value: unknown) => new mongoose.Types.ObjectId(String(value));
const isOid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
const str = (value: unknown) => (value == null ? "" : String((value as any)?._id ?? value));

export const nameOf = (m: any) =>
  [m?.fName, m?.lName].filter(Boolean).join(" ").trim() || "A member";

// ------------------------------------------------------------------ context

/// The committee a tracker call is about: the one named, or the tech
/// committee by default. Never matched by name.
export async function trackerCommittee(committeeId?: string | null) {
  await connectDB();
  if (committeeId) {
    if (!isOid(committeeId)) throw notFound("Not found");
    const committee = await Committee.findById(committeeId).lean<any>();
    if (!committee) throw notFound("Not found");
    return committee;
  }
  const tech = await getTechCommittee();
  if (!tech) {
    throw notFound("No tech committee is set. An officer can turn it on in the committee settings.");
  }
  return tech;
}

export function rosterIds(committee: any): string[] {
  const ids = new Set<string>();
  if (committee?.committeeHeadId) ids.add(str(committee.committeeHeadId));
  for (const m of committee?.committeeMembers || []) ids.add(str(m));
  return Array.from(ids).filter(Boolean);
}

export interface RosterMember {
  id: string;
  name: string;
  initials: string;
  isHead: boolean;
}

async function rosterMembers(committee: any): Promise<RosterMember[]> {
  const ids = rosterIds(committee);
  const members = await Member.find({ _id: { $in: ids } })
    .select("fName lName")
    .lean<any[]>();
  const head = str(committee.committeeHeadId);
  return members
    .map((m) => ({
      id: str(m._id),
      name: nameOf(m),
      initials: `${(m.fName || "?")[0] || ""}${(m.lName || "")[0] || ""}`.toUpperCase(),
      isHead: str(m._id) === head,
    }))
    .sort((a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name));
}

export interface TagDTO {
  id: string;
  name: string;
  color: string;
}

async function committeeTags(committeeId: unknown): Promise<TagDTO[]> {
  const tags = await TaskTag.find({ committeeId }).sort({ name: 1 }).lean<any[]>();
  return tags.map((t) => ({ id: str(t._id), name: t.name, color: t.color }));
}

/// Tells every open tracker tab on this committee to refetch.
function broadcast(committee: any, actor?: Actor) {
  for (const id of rosterIds(committee)) publishLive(id, "tasks");
  if (actor?._id) publishLive(actor._id, "tasks");
}

// ------------------------------------------------------------------ DTOs

export interface TaskDTO {
  id: string;
  key: string;
  number: number;
  committeeId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  tagIds: string[];
  dueAt: string | null;
  dueAllDay: boolean;
  dueLabel: string | null;
  checklist: { id: string; text: string; done: boolean; assigneeId: string | null }[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  sortOrder: number;
  bugReportId: string | null;
  archivedAt: string | null;
  dueState: ReturnType<typeof dueState>;
  staleLevel: ReturnType<typeof staleLevel>;
  staleDays: number;
  /// Set when anyone with the link (signed in or not) can read the task.
  shareToken: string | null;
  autoSorted: boolean;
}

const iso = (d: any) => (d ? new Date(d).toISOString() : null);

export function toTaskDTO(task: any, committee: any, now = new Date()): TaskDTO {
  return {
    id: str(task._id),
    key: taskKey(task),
    number: task.number,
    committeeId: str(task.committeeId),
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    assigneeIds: (task.assigneeIds || []).map(str),
    tagIds: (task.tagIds || []).map(str),
    dueAt: iso(task.dueAt),
    dueAllDay: task.dueAllDay !== false,
    dueLabel: task.dueAt ? dueLabel(new Date(task.dueAt), task.dueAllDay !== false) : null,
    checklist: (task.checklist || []).map((c: any) => ({
      id: str(c._id),
      text: c.text,
      done: Boolean(c.done),
      assigneeId: c.assigneeId ? str(c.assigneeId) : null,
    })),
    createdBy: task.createdBy ? str(task.createdBy) : null,
    createdAt: iso(task.createdAt)!,
    updatedAt: iso(task.updatedAt)!,
    statusChangedAt: iso(task.statusChangedAt),
    startedAt: iso(task.startedAt),
    completedAt: iso(task.completedAt),
    lastActivityAt: iso(task.lastActivityAt),
    sortOrder: task.sortOrder ?? 0,
    bugReportId: task.bugReportId ? str(task.bugReportId) : null,
    archivedAt: iso(task.archivedAt),
    dueState: task.archivedAt ? null : dueState(task, now),
    staleLevel: task.archivedAt ? null : staleLevel(task, now),
    staleDays: staleDays(task, now),
    shareToken: task.shareToken || null,
    autoSorted: Boolean(task.autoSorted),
  };
}

export interface TrackerContext {
  committee: { id: string; name: string; prefix: string; headId: string | null };
  members: RosterMember[];
  tags: TagDTO[];
  viewer: { id: string; canManage: boolean };
}

export async function trackerContext(actor: Actor, committee: any): Promise<TrackerContext> {
  const [members, tags] = await Promise.all([rosterMembers(committee), committeeTags(committee._id)]);
  return {
    committee: {
      id: str(committee._id),
      name: committee.name,
      prefix: TASK_KEY_PREFIX,
      headId: committee.committeeHeadId ? str(committee.committeeHeadId) : null,
    },
    members,
    tags,
    viewer: { id: str(actor?._id), canManage: canManageTracker(actor, committee) },
  };
}

// ------------------------------------------------------------------ lookup

/// A task by key ("TECH-14") or id, with its committee, access-checked.
export async function loadTask(actor: Actor, keyOrId: string, level: "view" | "manage" = "view") {
  await connectDB();
  let task: any = null;
  let committee: any = null;
  if (isOid(keyOrId)) {
    task = await Task.findById(keyOrId).lean<any>();
    if (task) committee = await Committee.findById(task.committeeId).lean<any>();
  } else {
    const parsed = parseTaskKey(keyOrId);
    if (!parsed) throw notFound("Not found");
    task = await Task.findOne({ code: parsed.code }).lean<any>();
    if (task) committee = await Committee.findById(task.committeeId).lean<any>();
  }
  if (!task || !committee) throw notFound("Not found");
  assertTrackerAccess(actor, committee, level);
  return { task, committee };
}

// ------------------------------------------------------------------ list

export interface TaskFilter {
  committeeId?: string | null;
  mine?: boolean;
  status?: TaskStatus[];
  assignee?: string | "none";
  priority?: TaskPriority[];
  tag?: string;
  due?: "overdue" | "week" | "none";
  q?: string;
  includeArchived?: boolean;
  /// Only archived tasks, newest archive first (the Archived tab).
  archivedOnly?: boolean;
}

export async function listTasks(actor: Actor, filter: TaskFilter = {}) {
  const committee = await trackerCommittee(filter.committeeId);
  await backfillCodes(committee._id);
  assertTrackerAccess(actor, committee, "view");
  const now = new Date();

  const query: any = { committeeId: committee._id };
  if (filter.archivedOnly) query.archivedAt = { $ne: null };
  else if (!filter.includeArchived) query.archivedAt = null;
  if (filter.status?.length) query.status = { $in: filter.status.filter((s) => STATUSES.includes(s)) };
  if (filter.priority?.length) query.priority = { $in: filter.priority.filter((p) => PRIORITIES.includes(p)) };
  if (filter.mine) query.assigneeIds = actor._id;
  else if (filter.assignee === "none") query.assigneeIds = { $size: 0 };
  else if (filter.assignee && isOid(filter.assignee)) query.assigneeIds = oid(filter.assignee);
  if (filter.tag && isOid(filter.tag)) query.tagIds = oid(filter.tag);
  if (filter.due === "none") query.dueAt = null;
  if (filter.due === "overdue") {
    query.dueAt = { $lt: now };
    query.status = query.status ?? { $in: OPEN_STATUSES };
  }
  if (filter.due === "week") query.dueAt = { $gte: now, $lte: new Date(now.getTime() + 7 * 86_400_000) };
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    const asKey = parseTaskKey(q);
    if (asKey && /^ttdg-/i.test(q)) query.code = asKey.code;
    else query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }

  const tasks = await Task.find(query)
    .sort(filter.archivedOnly ? { archivedAt: -1 } : { sortOrder: 1, number: 1 })
    .limit(1000)
    .lean<any[]>();
  return {
    tasks: tasks.map((t) => toTaskDTO(t, committee, now)),
    context: await trackerContext(actor, committee),
  };
}

// ------------------------------------------------------------------ get

export interface ActivityDTO {
  id: string;
  kind: ActivityKind;
  actorId: string | null;
  actorName: string;
  body: string;
  editedAt: string | null;
  deleted: boolean;
  from: unknown;
  to: unknown;
  createdAt: string;
}

export async function taskActivity(taskId: unknown): Promise<ActivityDTO[]> {
  const rows = await TaskActivity.find({ taskId }).sort({ createdAt: 1 }).limit(2000).lean<any[]>();
  const actorIds = Array.from(new Set(rows.map((r) => str(r.actorId)).filter(Boolean)));
  const actors = await Member.find({ _id: { $in: actorIds } }).select("fName lName").lean<any[]>();
  const names = new Map(actors.map((a) => [str(a._id), nameOf(a)]));
  return rows.map((r) => ({
    id: str(r._id),
    kind: r.kind,
    actorId: r.actorId ? str(r.actorId) : null,
    actorName: r.actorId ? names.get(str(r.actorId)) || "A member" : r.kind === "auto_sorted" ? "Auto-sort" : "System",
    body: r.deletedAt ? "" : r.body || "",
    editedAt: iso(r.editedAt),
    deleted: Boolean(r.deletedAt),
    from: r.from ?? null,
    to: r.to ?? null,
    createdAt: iso(r.createdAt)!,
  }));
}

/// Tasks accepted from a report before the bug card existed had the
/// report's area, page and device pasted under the description. The card
/// shows those now, so the first open trims them off (once, in place).
const PASTED_REPORT_DETAILS =
  /\n*Reported as (?:TTDG-)?R-?\d+:[^\n]*(?:\n(?:Page|Device|App version|Screenshots): [^\n]*)*\s*$/;

async function trimPastedReportDetails(task: any) {
  if (!task.bugReportId || !PASTED_REPORT_DETAILS.test(task.description || "")) return;
  const description = String(task.description).replace(PASTED_REPORT_DETAILS, "").trimEnd();
  await Task.updateOne({ _id: task._id, description: task.description }, { $set: { description } });
  task.description = description;
}

export async function getTask(actor: Actor, key: string) {
  const { task, committee } = await loadTask(actor, key);
  await trimPastedReportDetails(task);
  const [activity, context] = await Promise.all([taskActivity(task._id), trackerContext(actor, committee)]);
  return { task: toTaskDTO(task, committee), activity, context };
}

// ------------------------------------------------------------------ validation

const idList = z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20);

const dueInput = {
  /// ISO instant for a timed due date.
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  /// `YYYY-MM-DD` for an all-day due date (23:59 Phoenix).
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueAllDay: z.boolean().optional(),
};

export const createTaskSchema = z.object({
  committeeId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Give the task a title").max(200),
  description: z.string().max(20000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeIds: idList.optional(),
  tagIds: idList.optional(),
  ...dueInput,
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200).optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeIds: idList.optional(),
  tagIds: idList.optional(),
  ...dueInput,
  checklist: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().trim().min(1).max(300),
        done: z.boolean(),
        assigneeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
      })
    )
    .max(100)
    .optional(),
  archived: z.boolean().optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest(result.error.issues[0]?.message || "Invalid request");
  return result.data;
}

/// Assignees must be on the committee. Silently dropping a stranger would
/// hide the mistake, so refuse instead.
function assertOnRoster(committee: any, ids: string[]) {
  const roster = new Set(rosterIds(committee));
  const stranger = ids.find((id) => !roster.has(id));
  if (stranger) throw badRequest("Assignees must be on the committee");
}

async function assertTags(committee: any, ids: string[]) {
  if (!ids.length) return;
  const count = await TaskTag.countDocuments({ committeeId: committee._id, _id: { $in: ids } });
  if (count !== new Set(ids).size) throw badRequest("Unknown tag");
}

function resolveDue(input: { dueAt?: string | null; dueDate?: string | null; dueAllDay?: boolean }):
  | { dueAt: Date | null; dueAllDay: boolean }
  | undefined {
  if (input.dueDate !== undefined) {
    return input.dueDate ? { dueAt: allDayDueAt(input.dueDate), dueAllDay: true } : { dueAt: null, dueAllDay: true };
  }
  if (input.dueAt !== undefined) {
    return input.dueAt
      ? { dueAt: new Date(input.dueAt), dueAllDay: input.dueAllDay ?? false }
      : { dueAt: null, dueAllDay: true };
  }
  return undefined;
}

async function writeActivity(
  task: any,
  actor: Actor,
  kind: ActivityKind,
  extra: { from?: unknown; to?: unknown; body?: string; mentions?: string[] } = {}
) {
  return TaskActivity.create({
    taskId: task._id,
    committeeId: task.committeeId,
    actorId: actor?._id ?? null,
    kind,
    body: extra.body ?? "",
    from: extra.from ?? null,
    to: extra.to ?? null,
    mentions: (extra.mentions || []).map(oid),
  });
}

// ------------------------------------------------------------------ codes

/// Inserts with a fresh `code`, retrying on the rare collision.
async function createWithCode(doc: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Task.create({ ...doc, code: newTaskCode() });
    } catch (err: any) {
      if (err?.code !== 11000 || !/code/.test(String(err?.message)) || attempt > 8) throw err;
    }
  }
}

/// Tasks made before keys were codes get one the first time their tracker loads.
async function backfillCodes(committeeId: unknown) {
  const missing = await Task.find({ committeeId, code: null }).select("_id").lean<any[]>();
  for (const row of missing) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await Task.updateOne({ _id: row._id, code: null }, { $set: { code: newTaskCode() } });
        break;
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
  }
}

// ------------------------------------------------------------------ create

export async function createTask(
  actor: Actor,
  input: unknown,
  opts: { bugReportId?: unknown; silent?: boolean; system?: boolean; autoSort?: boolean } = {}
) {
  const data = parse(createTaskSchema, input);
  const committee = await trackerCommittee(data.committeeId);
  // `system` is the bug auto-triage, which has no signed-in actor.
  if (!opts.system) assertTrackerAccess(actor, committee, "view");

  const assigneeIds = Array.from(new Set(data.assigneeIds || []));
  const tagIds = Array.from(new Set(data.tagIds || []));
  assertOnRoster(committee, assigneeIds);
  await assertTags(committee, tagIds);

  const counter = await Committee.findOneAndUpdate(
    { _id: committee._id },
    { $inc: { taskCounter: 1 } },
    { new: true }
  ).lean<any>();
  const number = counter?.taskCounter ?? 1;
  const status = data.status ?? "todo";
  const last = await Task.findOne({ committeeId: committee._id, status })
    .sort({ sortOrder: -1 })
    .select("sortOrder")
    .lean<any>();
  const now = new Date();
  const due = resolveDue(data) ?? { dueAt: null, dueAllDay: true };
  const times = statusTimes("backlog", status, {}, now);

  const task = await createWithCode({
    committeeId: committee._id,
    number,
    title: data.title,
    description: data.description ?? "",
    status,
    priority: data.priority ?? "none",
    assigneeIds,
    tagIds,
    ...due,
    createdBy: actor?._id ?? null,
    statusChangedAt: now,
    startedAt: times.startedAt ?? null,
    completedAt: STATUS_GROUP[status] === "completed" || STATUS_GROUP[status] === "canceled" ? now : null,
    lastActivityAt: now,
    sortOrder: sortBetween(last?.sortOrder, null),
    bugReportId: opts.bugReportId ?? null,
  });
  await writeActivity(task, actor, "created");
  if (opts.bugReportId) await writeActivity(task, actor, "linked_bug", { to: str(opts.bugReportId) });

  const lean = task.toObject();
  if (!opts.silent) {
    void notifyTasks.assigned(lean, committee, actor, assigneeIds.filter((id) => id !== str(actor?._id)));
  }
  broadcast(committee, actor);
  if (opts.autoSort !== false && (!tagIds.length || lean.priority === "none")) {
    void import("./autosort").then((m) => m.autoSortTask(lean._id));
  }
  return toTaskDTO(lean, committee, now);
}

// ------------------------------------------------------------------ update

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function updateTask(actor: Actor, key: string, input: unknown) {
  const patch = parse(updateTaskSchema, input);
  const { task, committee } = await loadTask(actor, key);
  const now = new Date();
  const set: Record<string, any> = {};
  const events: Array<{ kind: ActivityKind; from?: unknown; to?: unknown }> = [];

  if (patch.title !== undefined && patch.title !== task.title) {
    set.title = patch.title;
    events.push({ kind: "title", from: task.title, to: patch.title });
  }
  if (patch.description !== undefined && patch.description !== (task.description || "")) {
    set.description = patch.description;
    events.push({ kind: "description" });
  }
  let statusChange: { from: TaskStatus; to: TaskStatus } | null = null;
  if (patch.status !== undefined && patch.status !== task.status) {
    statusChange = { from: task.status, to: patch.status };
    const times = statusTimes(
      task.status,
      patch.status,
      { statusChangedAt: task.statusChangedAt, startedAt: task.startedAt, completedAt: task.completedAt },
      now
    );
    Object.assign(set, { status: patch.status, ...times });
    events.push({ kind: "status", from: task.status, to: patch.status });
    // Moving into a new column lands at its bottom.
    const last = await Task.findOne({ committeeId: committee._id, status: patch.status })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean<any>();
    set.sortOrder = sortBetween(last?.sortOrder, null);
    // Reopening re-arms the reminders that belong to the open life of a task.
    if (STATUS_GROUP[patch.status] === "started" && STATUS_GROUP[task.status as TaskStatus] !== "started") {
      set["reminderState.staleSentAt"] = null;
    }
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    set.priority = patch.priority;
    events.push({ kind: "priority", from: task.priority, to: patch.priority });
  }

  const before: string[] = (task.assigneeIds || []).map(str);
  let added: string[] = [];
  let removed: string[] = [];
  if (patch.assigneeIds !== undefined) {
    const next = Array.from(new Set(patch.assigneeIds));
    if (!sameIds(before, next)) {
      assertOnRoster(
        committee,
        next.filter((id) => !before.includes(id))
      );
      set.assigneeIds = next.map(oid);
      added = next.filter((id) => !before.includes(id));
      removed = before.filter((id) => !next.includes(id));
      events.push({ kind: "assignees", from: before, to: next });
    }
  }
  if (patch.tagIds !== undefined) {
    const prev = (task.tagIds || []).map(str);
    const next = Array.from(new Set(patch.tagIds));
    if (!sameIds(prev, next)) {
      await assertTags(committee, next.filter((id) => !prev.includes(id)));
      set.tagIds = next.map(oid);
      events.push({ kind: "tags", from: prev, to: next });
    }
  }
  const due = resolveDue(patch);
  if (due) {
    const prevAt = task.dueAt ? new Date(task.dueAt).getTime() : null;
    const nextAt = due.dueAt ? due.dueAt.getTime() : null;
    if (prevAt !== nextAt || (task.dueAllDay !== false) !== due.dueAllDay) {
      set.dueAt = due.dueAt;
      set.dueAllDay = due.dueAllDay;
      // A new due date earns its own reminders.
      set["reminderState.dueSoonSentAt"] = null;
      set["reminderState.overdueSentAt"] = null;
      events.push({
        kind: "due",
        from: task.dueAt ? { at: iso(task.dueAt), allDay: task.dueAllDay !== false } : null,
        to: due.dueAt ? { at: due.dueAt.toISOString(), allDay: due.dueAllDay } : null,
      });
    }
  } else if (patch.dueAllDay !== undefined && task.dueAt && patch.dueAllDay !== (task.dueAllDay !== false)) {
    set.dueAllDay = patch.dueAllDay;
  }
  if (patch.checklist !== undefined) {
    const prev = task.checklist || [];
    const prevById = new Map<string, any>(prev.map((c: any) => [str(c._id), c]));
    const roster = new Set(rosterIds(committee));
    const next = patch.checklist.map((item) => {
      const old = item.id ? prevById.get(item.id) : null;
      const assigneeId = item.assigneeId && roster.has(item.assigneeId) ? oid(item.assigneeId) : null;
      return {
        ...(old ? { _id: old._id } : {}),
        text: item.text,
        done: item.done,
        doneAt: item.done ? (old?.done ? old.doneAt : now) : null,
        assigneeId,
      };
    });
    const summarize = (items: any[]) =>
      items.map((c) => `${c.done ? "x" : " "}${c.text}${c.assigneeId ? `@${str(c.assigneeId)}` : ""}`).join("\n");
    if (summarize(prev) !== summarize(next)) {
      set.checklist = next;
      const doneBefore = prev.filter((c: any) => c.done).length;
      const doneAfter = next.filter((c) => c.done).length;
      events.push({
        kind: "checklist",
        from: { done: doneBefore, total: prev.length },
        to: { done: doneAfter, total: next.length },
      });
    }
  }
  if (patch.archived !== undefined && patch.archived !== Boolean(task.archivedAt)) {
    set.archivedAt = patch.archived ? now : null;
    events.push({ kind: "archived", from: Boolean(task.archivedAt), to: patch.archived });
  }

  if (!Object.keys(set).length) return toTaskDTO(task, committee, now);
  set.lastActivityAt = now;

  const updated = await Task.findOneAndUpdate({ _id: task._id }, { $set: set }, { new: true }).lean<any>();
  for (const event of events) await writeActivity(updated, actor, event.kind, event);

  if (added.length) void notifyTasks.assigned(updated, committee, actor, added.filter((id) => id !== str(actor?._id)));
  if (removed.length) void notifyTasks.unassigned(updated, committee, actor, removed.filter((id) => id !== str(actor?._id)), added);
  if (statusChange) {
    void notifyTasks.statusChanged(updated, committee, actor, statusChange.from, statusChange.to);
    if (updated.bugReportId) {
      const { syncBugFromTask } = await import("@/lib/bugs/service");
      await syncBugFromTask(updated).catch((err: any) =>
        logger.warn({ err, taskId: str(updated._id) }, "Bug status sync failed")
      );
    }
  }
  broadcast(committee, actor);
  return toTaskDTO(updated, committee, now);
}

// ------------------------------------------------------------------ reorder

export const reorderSchema = z.object({
  status: z.enum(STATUSES),
  beforeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  afterId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
});

/// Drag on the board: lands between `beforeId` (above) and `afterId` (below)
/// in `status`, changing status first if the card crossed columns.
export async function reorderTask(actor: Actor, key: string, input: unknown) {
  const data = parse(reorderSchema, input);
  let { task, committee } = await loadTask(actor, key);
  if (data.status !== task.status) {
    await updateTask(actor, str(task._id), { status: data.status });
    ({ task, committee } = await loadTask(actor, str(task._id)));
  }
  const neighbours = await Task.find({
    _id: { $in: [data.beforeId, data.afterId].filter(Boolean).map(oid) },
    committeeId: committee._id,
  })
    .select("sortOrder")
    .lean<any[]>();
  const order = (id?: string | null) => neighbours.find((n) => str(n._id) === id)?.sortOrder;
  const sortOrder = sortBetween(order(data.beforeId), order(data.afterId));
  const updated = await Task.findOneAndUpdate(
    { _id: task._id },
    { $set: { sortOrder } },
    { new: true }
  ).lean<any>();
  broadcast(committee, actor);
  return toTaskDTO(updated, committee);
}

// ------------------------------------------------------------------ delete

export async function deleteTask(actor: Actor, key: string) {
  const { task, committee } = await loadTask(actor, key, "manage");
  await TaskActivity.deleteMany({ taskId: task._id });
  await Task.deleteOne({ _id: task._id });
  if (task.bugReportId) {
    const { unlinkBugFromTask } = await import("@/lib/bugs/service");
    await unlinkBugFromTask(task.bugReportId).catch(() => undefined);
  }
  broadcast(committee, actor);
  return { deleted: true };
}

// ------------------------------------------------------------------ sharing

/// Turns the public link on (a fresh token) or off. Anyone who can see the
/// task can share it; the activity says who did.
export async function setTaskShare(actor: Actor, key: string, input: unknown) {
  const { public: on } = parse(z.object({ public: z.boolean() }), input);
  const { task, committee } = await loadTask(actor, key);
  if (Boolean(task.shareToken) === on) return { shareToken: task.shareToken || null };
  const shareToken = on ? randomBytes(12).toString("base64url") : null;
  await Task.updateOne({ _id: task._id }, { $set: { shareToken } });
  await writeActivity(task, actor, "shared", { to: on });
  broadcast(committee, actor);
  return { shareToken };
}

export interface SharedTaskView {
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueLabel: string | null;
  dueState: ReturnType<typeof dueState>;
  checklist: { text: string; done: boolean }[];
  tags: { name: string; color: string }[];
  assignees: string[];
  committeeName: string;
  updatedAt: string;
}

/// What the public page shows. First names only; no comments or history.
export async function getSharedTask(token: string): Promise<SharedTaskView | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token || "")) return null;
  await connectDB();
  const task = await Task.findOne({ shareToken: token, archivedAt: null }).lean<any>();
  if (!task) return null;
  const [committee, tags, people] = await Promise.all([
    Committee.findById(task.committeeId).select("name").lean<any>(),
    TaskTag.find({ _id: { $in: task.tagIds || [] } }).lean<any[]>(),
    Member.find({ _id: { $in: task.assigneeIds || [] } }).select("fName").lean<any[]>(),
  ]);
  return {
    key: taskKey(task),
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    dueLabel: task.dueAt ? dueLabel(new Date(task.dueAt), task.dueAllDay !== false) : null,
    dueState: dueState(task, new Date()),
    checklist: (task.checklist || []).map((c: any) => ({ text: c.text, done: Boolean(c.done) })),
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
    assignees: people.map((m) => m.fName).filter(Boolean),
    committeeName: committee?.name || "Theta Tau",
    updatedAt: iso(task.updatedAt)!,
  };
}

// ------------------------------------------------------------------ comments

export const commentSchema = z.object({ body: z.string().trim().min(1, "Write something first").max(10000) });

export async function addComment(actor: Actor, key: string, input: unknown) {
  const { body } = parse(commentSchema, input);
  const { task, committee } = await loadTask(actor, key);
  const roster = new Set(rosterIds(committee));
  const mentions = parseMentions(body).filter((id) => roster.has(id) && id !== str(actor?._id));
  const row = await writeActivity(task, actor, "comment", { body, mentions });
  await Task.updateOne({ _id: task._id }, { $set: { lastActivityAt: new Date() } });
  void notifyTasks.commented(task, committee, actor, body, mentions);
  broadcast(committee, actor);
  return (await taskActivity(task._id)).find((a) => a.id === str(row._id));
}

async function ownComment(actor: Actor, key: string, commentId: string, allowManager: boolean) {
  const { task, committee } = await loadTask(actor, key);
  if (!isOid(commentId)) throw notFound("Not found");
  const comment = await TaskActivity.findOne({ _id: commentId, taskId: task._id, kind: "comment" }).lean<any>();
  if (!comment || comment.deletedAt) throw notFound("Not found");
  const mine = str(comment.actorId) === str(actor?._id);
  if (!mine && !(allowManager && canManageTracker(actor, committee))) {
    throw forbidden("Only the author can change a comment");
  }
  return { task, committee, comment };
}

export async function editComment(actor: Actor, key: string, commentId: string, input: unknown) {
  const { body } = parse(commentSchema, input);
  const { task, committee } = await ownComment(actor, key, commentId, false);
  await TaskActivity.updateOne({ _id: commentId }, { $set: { body, editedAt: new Date() } });
  broadcast(committee, actor);
  return (await taskActivity(task._id)).find((a) => a.id === commentId);
}

export async function deleteComment(actor: Actor, key: string, commentId: string) {
  const { committee } = await ownComment(actor, key, commentId, true);
  await TaskActivity.updateOne({ _id: commentId }, { $set: { deletedAt: new Date(), body: "" } });
  broadcast(committee, actor);
  return { deleted: true };
}

// ------------------------------------------------------------------ tags

export const tagSchema = z.object({
  name: z.string().trim().min(1, "Name the tag").max(40),
  color: z.enum(TAG_COLORS).optional(),
});

export async function listTags(actor: Actor, committeeId?: string | null) {
  const committee = await trackerCommittee(committeeId);
  assertTrackerAccess(actor, committee, "view");
  return committeeTags(committee._id);
}

/// Anyone on the committee can create a tag inline from the picker.
export async function createTag(actor: Actor, committeeId: string | null | undefined, input: unknown) {
  const data = parse(tagSchema, input);
  const committee = await trackerCommittee(committeeId);
  assertTrackerAccess(actor, committee, "view");
  const existing = await TaskTag.findOne({
    committeeId: committee._id,
    name: { $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  }).lean<any>();
  if (existing) return { id: str(existing._id), name: existing.name, color: existing.color };
  const tag = await TaskTag.create({ committeeId: committee._id, name: data.name, color: data.color ?? "gray" });
  broadcast(committee, actor);
  return { id: str(tag._id), name: tag.name, color: tag.color };
}

async function loadTag(actor: Actor, tagId: string) {
  if (!isOid(tagId)) throw notFound("Not found");
  await connectDB();
  const tag = await TaskTag.findById(tagId).lean<any>();
  if (!tag) throw notFound("Not found");
  const committee = await Committee.findById(tag.committeeId).lean<any>();
  assertTrackerAccess(actor, committee, "manage");
  return { tag, committee };
}

export async function updateTag(actor: Actor, tagId: string, input: unknown) {
  const data = parse(tagSchema.partial(), input);
  const { tag, committee } = await loadTag(actor, tagId);
  const updated = await TaskTag.findOneAndUpdate({ _id: tag._id }, { $set: data }, { new: true }).lean<any>();
  broadcast(committee, actor);
  return { id: str(updated._id), name: updated.name, color: updated.color };
}

export async function deleteTag(actor: Actor, tagId: string) {
  const { tag, committee } = await loadTag(actor, tagId);
  await Task.updateMany({ committeeId: committee._id }, { $pull: { tagIds: tag._id } });
  await TaskTag.deleteOne({ _id: tag._id });
  broadcast(committee, actor);
  return { deleted: true };
}

// ------------------------------------------------------------------ team

export interface TeamRow {
  memberId: string;
  name: string;
  isHead: boolean;
  open: number;
  inProgress: number;
  overdue: number;
  stale: number;
  doneThisWeek: number;
  lastActivityAt: string | null;
}

/// One factual row per committee member. Not ranked: the order is the roster's.
export async function teamWorkload(actor: Actor, committeeId?: string | null): Promise<TeamRow[]> {
  const committee = await trackerCommittee(committeeId);
  assertTrackerAccess(actor, committee, "manage");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [members, tasks, lastActs] = await Promise.all([
    rosterMembers(committee),
    Task.find({ committeeId: committee._id, archivedAt: null }).lean<any[]>(),
    TaskActivity.aggregate([
      { $match: { committeeId: committee._id } },
      { $group: { _id: "$actorId", last: { $max: "$createdAt" } } },
    ]),
  ]);
  const lastBy = new Map(lastActs.map((r: any) => [str(r._id), r.last]));
  return members.map((m) => {
    const mine = tasks.filter((t) => (t.assigneeIds || []).some((id: any) => str(id) === m.id));
    const open = mine.filter((t) => OPEN_STATUSES.includes(t.status));
    return {
      memberId: m.id,
      name: m.name,
      isHead: m.isHead,
      open: open.length,
      inProgress: open.filter((t) => STATUS_GROUP[t.status as TaskStatus] === "started").length,
      overdue: open.filter((t) => dueState(t, now) === "overdue").length,
      stale: open.filter((t) => staleLevel(t, now)).length,
      doneThisWeek: mine.filter((t) => t.status === "done" && t.completedAt && new Date(t.completedAt) >= weekAgo).length,
      lastActivityAt: iso(lastBy.get(m.id)),
    };
  });
}

/// Open counts for the committee dashboard card. Null when the viewer cannot
/// see the tracker, so the card simply does not render.
export async function trackerSummary(actor: Actor, committeeId: string) {
  await connectDB();
  if (!isOid(committeeId)) return null;
  const committee = await Committee.findById(committeeId).lean<any>();
  if (!committee || !canViewTracker(actor, committee)) return null;
  const now = new Date();
  const open = await Task.find({
    committeeId: committee._id,
    archivedAt: null,
    status: { $in: OPEN_STATUSES },
  })
    .select("status dueAt dueAllDay lastActivityAt assigneeIds")
    .lean<any[]>();
  return {
    open: open.length,
    inProgress: open.filter((t) => STATUS_GROUP[t.status as TaskStatus] === "started").length,
    overdue: open.filter((t) => dueState(t, now) === "overdue").length,
    mine: open.filter((t) => (t.assigneeIds || []).some((id: any) => str(id) === str(actor?._id))).length,
    isTech: Boolean(committee.isTechCommittee),
  };
}

export type { Id };
