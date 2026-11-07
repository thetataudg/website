// lib/bugs/service.ts
// The bug portal: filing, following and triaging reports. API routes, MCP
// tools and the task service call this; nothing else writes BugReport.
//
// Privacy rules live here and nowhere else:
// - A report is visible to its reporter, its subscribers and the tech
//   committee (anyone who can view the tech committee's tracker).
// - Internal notes are returned only to the tech committee, are never
//   emailed, and never change `lastPublicActivityAt`.
// - The reporter never sees assignee names or task details; staff replies are
//   signed "Technology committee".
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import BugReport from "@/lib/models/BugReport";
import BugReportMessage from "@/lib/models/BugReportMessage";
import Member from "@/lib/models/Member";
import Task from "@/lib/models/Task";
import TaskActivity from "@/lib/models/TaskActivity";
import TaskTag from "@/lib/models/TaskTag";
import Committee from "@/lib/models/Committee";
import { getTechCommittee } from "@/lib/committeeQueries";
import { publishLive } from "@/lib/live";
import logger from "@/lib/logger";
import { rateLimit } from "@/lib/rateLimit";
import { badRequest, forbidden, HttpError, notFound } from "@/lib/httpError";
import { canViewTracker } from "@/lib/tasks/permissions";
import { publicStatusForTask, taskKey, excerpt } from "@/lib/tasks/logic";
import { send } from "@/lib/tasks/notifyTasks";
import {
  AREAS,
  AREA_LABEL,
  CLOSED_PUBLIC,
  MAX_SCREENSHOTS,
  PUBLIC_STATUS_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  formatRef,
  newRefNumber,
  parseRef,
  type PublicStatus,
} from "./constants";
import { canReport, canSeeBug, screenshotPrefixFor } from "./permissions";

type Actor = any;
const str = (v: unknown) => (v == null ? "" : String((v as any)?._id ?? v));
const iso = (d: any) => (d ? new Date(d).toISOString() : null);
const BUG_CHANNELS = ["email", "push"];

// ------------------------------------------------------------------ context

async function techContext(actor: Actor) {
  const tech = await getTechCommittee();
  return { tech, isStaff: Boolean(tech && canViewTracker(actor, tech)) };
}

function techRoster(tech: any): string[] {
  const ids = new Set<string>();
  if (tech?.committeeHeadId) ids.add(str(tech.committeeHeadId));
  for (const m of tech?.committeeMembers || []) ids.add(str(m));
  return Array.from(ids);
}

function broadcast(bug: any, tech: any) {
  publishLive(bug.reporterMemberId, "tasks");
  for (const id of bug.subscriberMemberIds || []) publishLive(id, "tasks");
  for (const id of techRoster(tech)) publishLive(id, "tasks");
}

async function loadBug(actor: Actor, ref: string | number) {
  await connectDB();
  // A linked task knows its report by id; everyone else by "TTDG-R2741".
  const byId = typeof ref === "string" && /^[a-f0-9]{24}$/i.test(ref);
  const n = byId ? null : typeof ref === "number" ? ref : parseRef(ref);
  if (!byId && !n) throw notFound("Not found");
  const bug = byId
    ? await BugReport.findById(ref).lean<any>()
    : await BugReport.findOne({ ref: n }).lean<any>();
  const ctx = await techContext(actor);
  // 404 rather than 403, so a ref does not confirm that a report exists.
  if (!bug || !canSeeBug(actor, bug, ctx.isStaff)) throw notFound("Not found");
  return { bug, ...ctx };
}

function assertStaff(isStaff: boolean) {
  if (!isStaff) throw forbidden("Only the tech committee can do that");
}

// ------------------------------------------------------------------ DTOs

export interface BugMessageDTO {
  id: string;
  visibility: "public" | "internal";
  authorRole: "staff" | "reporter";
  /// "Technology committee" for staff when shown to a reporter.
  authorName: string;
  body: string;
  screenshots: string[];
  createdAt: string;
}

export interface BugDTO {
  ref: string;
  title: string;
  description: string;
  area: string;
  areaLabel: string;
  severity: string;
  severityLabel: string;
  pageUrl: string;
  userAgent: string;
  appVersion: string;
  screenshots: string[];
  publicStatus: PublicStatus;
  statusLabel: string;
  needsInfo: boolean;
  createdAt: string;
  updatedAt: string;
  lastPublicActivityAt: string | null;
  unread: boolean;
  isReporter: boolean;
  /// Staff-only fields. Absent for the reporter view.
  staff?: {
    reporterName: string;
    reporterStatus: string;
    taskKey: string | null;
    duplicateOf: string | null;
  };
}

const shotUrl = (ref: number, key: string) =>
  `/api/report/${formatRef(ref)}/screenshots/${key.split("/").map(encodeURIComponent).join("/")}`;

function toBugDTO(bug: any, actor: Actor, staff?: BugDTO["staff"]): BugDTO {
  const isReporter = str(bug.reporterMemberId) === str(actor?._id);
  return {
    ref: formatRef(bug.ref),
    title: bug.title,
    description: bug.description,
    area: bug.area,
    areaLabel: AREA_LABEL[bug.area as keyof typeof AREA_LABEL] ?? bug.area,
    severity: bug.severity,
    severityLabel: SEVERITY_LABEL[bug.severity as keyof typeof SEVERITY_LABEL] ?? bug.severity,
    pageUrl: bug.pageUrl || "",
    userAgent: bug.userAgent || "",
    appVersion: bug.appVersion || "",
    screenshots: (bug.screenshotKeys || []).map((k: string) => shotUrl(bug.ref, k)),
    publicStatus: bug.publicStatus,
    statusLabel: PUBLIC_STATUS_LABEL[bug.publicStatus as PublicStatus],
    needsInfo: Boolean(bug.needsInfo),
    createdAt: iso(bug.createdAt)!,
    updatedAt: iso(bug.updatedAt)!,
    lastPublicActivityAt: iso(bug.lastPublicActivityAt),
    unread:
      isReporter &&
      Boolean(bug.lastPublicActivityAt) &&
      new Date(bug.lastPublicActivityAt).getTime() > new Date(bug.reporterLastSeenAt || 0).getTime(),
    isReporter,
    ...(staff ? { staff } : {}),
  };
}

async function staffFields(bug: any): Promise<BugDTO["staff"]> {
  const [reporter, task, dup] = await Promise.all([
    Member.findById(bug.reporterMemberId).select("fName lName status").lean<any>(),
    bug.taskId ? Task.findById(bug.taskId).select("committeeId code").lean<any>() : null,
    bug.duplicateOfId ? BugReport.findById(bug.duplicateOfId).select("ref").lean<any>() : null,
  ]);
  let key: string | null = null;
  if (task) key = taskKey(task);
  return {
    reporterName: [reporter?.fName, reporter?.lName].filter(Boolean).join(" ") || "A former member",
    reporterStatus: reporter?.status || "",
    taskKey: key,
    duplicateOf: dup ? formatRef(dup.ref) : null,
  };
}

async function messagesFor(bug: any, actor: Actor, isStaff: boolean): Promise<BugMessageDTO[]> {
  const rows = await BugReportMessage.find({
    bugReportId: bug._id,
    ...(isStaff ? {} : { visibility: "public" }),
  })
    .sort({ createdAt: 1 })
    .lean<any[]>();
  const authors = await Member.find({ _id: { $in: rows.map((r) => r.authorMemberId).filter(Boolean) } })
    .select("fName lName")
    .lean<any[]>();
  const names = new Map(authors.map((a) => [str(a._id), [a.fName, a.lName].filter(Boolean).join(" ")]));
  return rows.map((r) => ({
    id: str(r._id),
    visibility: r.visibility,
    authorRole: r.authorRole,
    // Staff see who wrote what; reporters only ever see the committee.
    authorName:
      r.authorRole === "staff"
        ? isStaff
          ? `${names.get(str(r.authorMemberId)) || "A member"} (Technology committee)`
          : "Technology committee"
        : str(r.authorMemberId) === str(actor?._id)
          ? "You"
          : names.get(str(r.authorMemberId)) || "Reporter",
    body: r.body,
    screenshots: (r.screenshotKeys || []).map((k: string) => shotUrl(bug.ref, k)),
    createdAt: iso(r.createdAt)!,
  }));
}

// ------------------------------------------------------------------ create

export const createBugSchema = z.object({
  title: z.string().trim().min(3, "Give it a short title").max(120),
  description: z.string().trim().min(5, "Say what happened").max(10000),
  area: z.enum(AREAS),
  severity: z.enum(SEVERITIES),
  pageUrl: z.string().trim().max(500).optional().default(""),
  userAgent: z.string().trim().max(500).optional().default(""),
  appVersion: z.string().trim().max(40).optional().default(""),
  screenshotKeys: z.array(z.string()).max(MAX_SCREENSHOTS).optional().default([]),
});

function parse<T>(schema: z.ZodType<T, any, any>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest(result.error.issues[0]?.message || "Check the form and try again");
  return result.data;
}

/// Uploaded screenshots may only be attached by the member who uploaded them.
function assertOwnShots(actor: Actor, keys: string[]) {
  const prefix = screenshotPrefixFor(actor);
  if (keys.some((k) => !k.startsWith(`${prefix}/`) || !/^[a-z0-9/_-]+\.jpg$/i.test(k))) {
    throw badRequest("One of the screenshots could not be attached");
  }
}

// In-memory limits are fine because production is a single container. They
// reset on deploy, which is acceptable for a speed bump.
function assertRate(actor: Actor, ip: string) {
  const perAccount = rateLimit(`bug:member:${str(actor._id)}`, 5, 3600);
  const perIp = rateLimit(`bug:ip:${ip}`, 20, 86400);
  if (!perAccount.ok || !perIp.ok) {
    throw new HttpError(429, "That is a lot of reports in a short time. Try again a little later.");
  }
}

export async function createBugReport(actor: Actor, input: unknown, meta: { ip: string }) {
  if (!canReport(actor)) throw forbidden("Your account cannot file reports");
  const data = parse(createBugSchema, input);
  assertOwnShots(actor, data.screenshotKeys);
  assertRate(actor, meta.ip);
  await connectDB();

  const now = new Date();
  let bug: any = null;
  for (let attempt = 0; !bug; attempt++) {
    try {
      bug = await BugReport.create({
        ...data,
        ref: newRefNumber(),
        reporterMemberId: actor._id,
        publicStatus: "received",
        lastPublicActivityAt: now,
        reporterLastSeenAt: now,
      });
    } catch (err: any) {
      // A random number already taken: draw again.
      if (err?.code !== 11000 || attempt > 20) throw err;
    }
  }
  const ref: number = bug.ref;
  const lean = bug.toObject();
  const { tech } = await techContext(actor);

  void send([str(actor._id)], "bug_received", {
    amountCents: 0,
    bugRef: formatRef(ref),
    bugTitle: data.title,
  }, { channels: BUG_CHANNELS });
  if (tech) {
    const reporterName = [actor.fName, actor.lName].filter(Boolean).join(" ") || "A member";
    const recipients =
      data.severity === "blocker" ? techRoster(tech) : tech.committeeHeadId ? [str(tech.committeeHeadId)] : [];
    void send(recipients.filter((id) => id !== str(actor._id)), "bug_new", {
      amountCents: 0,
      bugRef: formatRef(ref),
      bugTitle: data.title,
      bugSeverityLabel: SEVERITY_LABEL[data.severity],
      memberName: reporterName,
    }, { channels: BUG_CHANNELS });
  }
  broadcast(lean, tech);
  void autoTriageBug(lean._id);
  return toBugDTO(lean, actor);
}

// ------------------------------------------------------------------ read

export async function listMyReports(actor: Actor) {
  await connectDB();
  const rows = await BugReport.find({
    $or: [{ reporterMemberId: actor._id }, { subscriberMemberIds: actor._id }],
  })
    .sort({ lastPublicActivityAt: -1 })
    .limit(200)
    .lean<any[]>();
  return rows.map((b) => toBugDTO(b, actor));
}

/// Up to three of the reporter's own open reports with a similar title, so
/// they do not file the same thing twice. Chapter-wide dedupe is triage's job.
export async function similarReports(actor: Actor, q: string) {
  const words = (q || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .slice(0, 6);
  if (!words.length) return [];
  await connectDB();
  const rows = await BugReport.find({
    reporterMemberId: actor._id,
    publicStatus: { $nin: CLOSED_PUBLIC as unknown as string[] },
    title: { $regex: words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), $options: "i" },
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("ref title publicStatus")
    .lean<any[]>();
  return rows.map((b) => ({
    ref: formatRef(b.ref),
    title: b.title,
    statusLabel: PUBLIC_STATUS_LABEL[b.publicStatus as PublicStatus],
  }));
}

export async function getBugReport(actor: Actor, ref: string) {
  const { bug, isStaff } = await loadBug(actor, ref);
  const isReporter = str(bug.reporterMemberId) === str(actor._id);
  const dto = toBugDTO(bug, actor, isStaff ? await staffFields(bug) : undefined);
  const messages = await messagesFor(bug, actor, isStaff);
  if (isReporter) {
    await BugReport.updateOne({ _id: bug._id }, { $set: { reporterLastSeenAt: new Date() } });
    dto.unread = false;
  }
  return { report: dto, messages, isStaff };
}

// ------------------------------------------------------------------ messages

export const messageSchema = z.object({
  body: z.string().trim().max(10000).default(""),
  visibility: z.enum(["public", "internal"]).default("public"),
  screenshotKeys: z.array(z.string()).max(MAX_SCREENSHOTS).default([]),
});

export async function addBugMessage(actor: Actor, ref: string, input: unknown) {
  const data = parse(messageSchema, input);
  if (!data.body && !data.screenshotKeys.length) throw badRequest("Write something first");
  const { bug, tech, isStaff } = await loadBug(actor, ref);
  const isReporter = str(bug.reporterMemberId) === str(actor._id);
  // Reporters and subscribers can only ever write in public.
  const visibility = isStaff ? data.visibility : "public";
  assertOwnShots(actor, data.screenshotKeys);
  const authorRole = isStaff && !isReporter ? "staff" : "reporter";

  const row = await BugReportMessage.create({
    bugReportId: bug._id,
    authorMemberId: actor._id,
    visibility,
    authorRole,
    body: data.body,
    screenshotKeys: data.screenshotKeys,
  });

  if (visibility === "public") {
    const set: Record<string, unknown> = { lastPublicActivityAt: new Date() };
    if (isReporter) {
      set.reporterLastSeenAt = new Date();
      set.needsInfo = false;
    }
    await BugReport.updateOne({ _id: bug._id }, { $set: set });

    if (authorRole === "staff") {
      const recipients = [str(bug.reporterMemberId), ...(bug.subscriberMemberIds || []).map(str)].filter(
        (id) => id !== str(actor._id)
      );
      void send(recipients, "bug_reply", {
        amountCents: 0,
        bugRef: formatRef(bug.ref),
        bugTitle: bug.title,
        commentExcerpt: excerpt(data.body),
      }, { channels: BUG_CHANNELS });
    } else if (bug.taskId) {
      // A reporter's reply lands with whoever is working the linked task.
      const task = await Task.findById(bug.taskId).lean<any>();
      const committee = task ? await Committee.findById(task.committeeId).lean<any>() : null;
      if (task && committee) {
        const { taskContext } = await import("@/lib/tasks/notifyTasks");
        void send((task.assigneeIds || []).map(str), "task_commented", {
          ...taskContext(task, committee, actor),
          actorName: `The reporter of ${formatRef(bug.ref)}`,
          commentExcerpt: excerpt(data.body),
        });
      }
    }
  }
  broadcast(bug, tech);
  return (await messagesFor(bug, actor, isStaff)).find((m) => m.id === str(row._id));
}

// ------------------------------------------------------------------ status

async function setPublicStatus(bug: any, next: PublicStatus, extra: Record<string, unknown> = {}) {
  if (bug.publicStatus === next && !Object.keys(extra).length) return false;
  await BugReport.updateOne(
    { _id: bug._id },
    { $set: { publicStatus: next, lastPublicActivityAt: new Date(), ...extra } }
  );
  if (bug.publicStatus !== next) {
    const recipients = [str(bug.reporterMemberId), ...(bug.subscriberMemberIds || []).map(str)];
    void send(recipients, "bug_status_changed", {
      amountCents: 0,
      bugRef: formatRef(bug.ref),
      bugTitle: bug.title,
      bugStatusLabel: PUBLIC_STATUS_LABEL[next],
      bugStatus: next,
    }, { channels: BUG_CHANNELS });
  }
  return true;
}

export const patchBugSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("wont_fix"), message: z.string().trim().max(5000).optional() }),
  z.object({ action: z.literal("need_info"), message: z.string().trim().min(1, "Say what you need").max(5000) }),
  z.object({ action: z.literal("duplicate"), of: z.string().trim().min(1) }),
  z.object({ action: z.literal("subscribe") }),
]);

export async function patchBugReport(actor: Actor, ref: string, input: unknown) {
  const data = parse(patchBugSchema, input);
  const { bug, tech, isStaff } = await loadBug(actor, ref);
  const isReporter = str(bug.reporterMemberId) === str(actor._id);

  switch (data.action) {
    case "close":
      if (!isReporter && !isStaff) throw forbidden("Only the reporter can close this");
      await setPublicStatus(bug, "closed_by_reporter");
      break;
    case "reopen":
      if (!isReporter && !isStaff) throw forbidden("Only the reporter can reopen this");
      if (bug.publicStatus !== "closed_by_reporter") throw badRequest("Only a closed report can be reopened");
      {
        const task = bug.taskId ? await Task.findById(bug.taskId).select("status").lean<any>() : null;
        await setPublicStatus(bug, task ? publicStatusForTask(task.status) : "received");
      }
      break;
    case "wont_fix":
      assertStaff(isStaff);
      if (data.message) await addBugMessage(actor, ref, { body: data.message, visibility: "public" });
      await setPublicStatus(bug, "wont_fix", { needsInfo: false });
      break;
    case "need_info":
      assertStaff(isStaff);
      await addBugMessage(actor, ref, { body: data.message, visibility: "public" });
      await BugReport.updateOne({ _id: bug._id }, { $set: { needsInfo: true } });
      break;
    case "duplicate": {
      assertStaff(isStaff);
      const n = parseRef(data.of);
      const original = n ? await BugReport.findOne({ ref: n }).lean<any>() : null;
      if (!original || str(original._id) === str(bug._id)) throw badRequest("Pick another report");
      // The reporter follows the original from now on.
      await BugReport.updateOne(
        { _id: original._id },
        { $addToSet: { subscriberMemberIds: bug.reporterMemberId } }
      );
      await setPublicStatus(bug, "duplicate", { duplicateOfId: original._id, needsInfo: false });
      break;
    }
    case "subscribe":
      assertStaff(isStaff);
      await BugReport.updateOne({ _id: bug._id }, { $addToSet: { subscriberMemberIds: actor._id } });
      break;
  }
  broadcast(bug, tech);
  return getBugReport(actor, ref);
}

// ------------------------------------------------------------------ triage

export async function listTriage(actor: Actor, filter: { view?: "new" | "open" | "all" } = {}) {
  // "new" is kept for the MCP tool; the tracker shows Open and All.
  await connectDB();
  const { isStaff } = await techContext(actor);
  assertStaff(isStaff);
  const view = filter.view ?? "open";
  const query: any =
    view === "new"
      ? { taskId: null, publicStatus: "received" }
      : view === "open"
        ? { publicStatus: { $nin: CLOSED_PUBLIC as unknown as string[] } }
        : {};
  const rows = await BugReport.find(query).sort({ createdAt: -1 }).limit(300).lean<any[]>();
  return Promise.all(rows.map(async (b) => toBugDTO(b, actor, await staffFields(b))));
}

const SEVERITY_PRIORITY = { blocker: "high", annoying: "medium", minor: "low", idea: "none" } as const;

/// Just what the reporter wrote. Area, severity, page, device and
/// screenshots show in the task's bug report card, not pasted into the text.
function taskDescriptionFor(bug: any): string {
  return bug.description || "";
}

/// With GROQ_API_KEY set, a new report goes straight into the tech
/// tracker's Todo column with a priority and tags (the same place a person
/// accepting it would put it). Anything the model calls
/// spam or nonsense (or any failure) stays in Triage for a person.
async function autoTriageBug(bugId: unknown): Promise<void> {
  try {
    const { groqEnabled } = await import("@/lib/ai/groq");
    if (!groqEnabled()) return;
    const { suggestSort, resolveTags, summary } = await import("@/lib/tasks/autosort");
    const bug = await BugReport.findById(bugId).lean<any>();
    const tech = await getTechCommittee();
    if (!bug || !tech || bug.taskId) return;
    const tagNames = (await TaskTag.find({ committeeId: tech._id }).select("name").lean<any[]>()).map((t) => t.name);
    const s = await suggestSort(
      {
        title: bug.title,
        description: bug.description,
        extra: `Area: ${AREA_LABEL[bug.area as keyof typeof AREA_LABEL] ?? bug.area}. The reporter called it: ${SEVERITY_LABEL[bug.severity as keyof typeof SEVERITY_LABEL] ?? bug.severity}.`,
      },
      tagNames
    );
    if (!s || s.actionable === false) return;
    const tags = await resolveTags(tech._id, s, true);
    const priority =
      s.priority !== "none" ? s.priority : SEVERITY_PRIORITY[bug.severity as keyof typeof SEVERITY_PRIORITY] ?? "none";

    const { createTask } = await import("@/lib/tasks/service");
    const task = await createTask(
      null,
      {
        committeeId: str(tech._id),
        title: bug.title,
        description: taskDescriptionFor(bug),
        status: "todo",
        priority,
        tagIds: tags.map((t) => str(t._id)),
      },
      { bugReportId: bug._id, system: true, silent: true, autoSort: false }
    );
    // Lost a race with a person accepting it by hand: theirs wins.
    const claimed = await BugReport.updateOne(
      { _id: bug._id, taskId: null },
      { $set: { taskId: new mongoose.Types.ObjectId(task.id) } }
    );
    if (!claimed.modifiedCount) {
      await Task.deleteOne({ _id: task.id });
      return;
    }
    await Task.updateOne({ _id: task.id }, { $set: { autoSorted: true } });
    await TaskActivity.create({
      taskId: task.id,
      committeeId: tech._id,
      actorId: null,
      kind: "auto_sorted",
      body: `filed this from ${formatRef(bug.ref)} and ${summary(tags.map((t) => t.name), priority === "none" ? null : priority) || "sent it to Todo"}`,
    });
    await setPublicStatus({ ...bug, taskId: task.id }, publicStatusForTask("todo"));
    broadcast(bug, tech);
  } catch (err) {
    logger.warn({ err }, "Bug auto-triage failed");
  }
}

export const acceptSchema = z.object({
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  assigneeIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20).optional(),
});

/// Accept: create the linked task on the tech tracker. From then on the
/// task's status drives the report's public status.
export async function acceptBugReport(actor: Actor, ref: string, input: unknown) {
  const data = parse(acceptSchema, input ?? {});
  const { bug, tech, isStaff } = await loadBug(actor, ref);
  assertStaff(isStaff);
  if (bug.taskId) throw badRequest("This report already has a task");
  const { createTask } = await import("@/lib/tasks/service");
  const task = await createTask(
    actor,
    {
      committeeId: str(tech._id),
      title: bug.title,
      description: taskDescriptionFor(bug),
      status: "todo",
      priority: data.priority ?? SEVERITY_PRIORITY[bug.severity as keyof typeof SEVERITY_PRIORITY] ?? "none",
      assigneeIds: data.assigneeIds ?? [],
    },
    { bugReportId: bug._id }
  );
  await BugReport.updateOne({ _id: bug._id }, { $set: { taskId: new mongoose.Types.ObjectId(task.id), needsInfo: false } });
  await setPublicStatus({ ...bug, taskId: task.id }, publicStatusForTask(task.status));
  broadcast(bug, tech);
  return { taskKey: task.key };
}

// ------------------------------------------------------------------ task hooks

/// Called by the task service whenever a linked task changes status.
export async function syncBugFromTask(task: any): Promise<void> {
  if (!task?.bugReportId) return;
  const bug = await BugReport.findById(task.bugReportId).lean<any>();
  // A duplicate or a report the reporter closed stays as it is.
  if (!bug || bug.publicStatus === "duplicate" || bug.publicStatus === "closed_by_reporter") return;
  await setPublicStatus(bug, publicStatusForTask(task.status));
  const tech = await getTechCommittee();
  broadcast(bug, tech);
}

export async function unlinkBugFromTask(bugReportId: unknown): Promise<void> {
  const bug = await BugReport.findById(bugReportId).lean<any>();
  if (!bug) return;
  await BugReport.updateOne({ _id: bug._id }, { $set: { taskId: null } });
  if (bug.publicStatus === "triaged" || bug.publicStatus === "in_progress") {
    await setPublicStatus(bug, "received");
  }
}

/// For the screenshot route: may this actor see this stored image?
export async function canSeeScreenshot(actor: Actor, ref: string, key: string): Promise<boolean> {
  try {
    const { bug, isStaff } = await loadBug(actor, ref);
    if ((bug.screenshotKeys || []).includes(key)) return true;
    const message = await BugReportMessage.findOne({ bugReportId: bug._id, screenshotKeys: key })
      .select("visibility")
      .lean<any>();
    if (!message) return false;
    return message.visibility === "public" || isStaff;
  } catch (err: any) {
    if (err?.statusCode === 404) return false;
    logger.warn({ err }, "Screenshot access check failed");
    return false;
  }
}

export { formatRef };
