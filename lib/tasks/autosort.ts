// lib/tasks/autosort.ts
// Groq-backed sorting. A new task with no tags or no priority gets them
// filled in; a new bug report gets turned into a Backlog task with priority
// and tags. Only empty fields are ever filled, never a person's choice, and
// every fill writes an "Auto-sort" line in the timeline. Without
// GROQ_API_KEY all of this is a no-op.
import { z } from "zod";

import { groqEnabled, groqJson } from "@/lib/ai/groq";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import Committee from "@/lib/models/Committee";
import Task from "@/lib/models/Task";
import TaskActivity from "@/lib/models/TaskActivity";
import TaskTag from "@/lib/models/TaskTag";
import { publishLive } from "@/lib/live";
import { PRIORITIES, PRIORITY_LABEL, TAG_COLORS, type TaskPriority } from "./constants";

const str = (v: unknown) => (v == null ? "" : String((v as any)?._id ?? v));

const suggestionSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(3).catch([]),
  newTag: z.string().min(2).max(24).nullable().optional().catch(null),
  priority: z.enum(PRIORITIES).catch("none"),
  actionable: z.boolean().optional().catch(true),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

const SYSTEM = `You sort tasks for a college fraternity's technology committee (website, member dashboard, iOS app, email, dues payments, events, Discord bot).
Reply with JSON only: {"tags": string[], "newTag": string|null, "priority": "urgent"|"high"|"medium"|"low"|"none", "actionable": boolean}.
- tags: up to 3 names copied exactly from the EXISTING TAGS list that fit. Prefer existing tags.
- newTag: only if nothing existing fits and the committee would reuse it; a short Title Case category like "Payments" or "iOS". Otherwise null.
- priority: urgent = people cannot pay, sign in or use a core feature right now; high = broken for many or blocks work this week; medium = real but has a workaround; low = polish or small; none = idea or unclear.
- actionable: false for spam, jokes, empty or nonsense text.`;

export async function suggestSort(
  input: { title: string; description: string; extra?: string },
  tagNames: string[]
): Promise<Suggestion | null> {
  if (!groqEnabled()) return null;
  const user = [
    `EXISTING TAGS: ${tagNames.length ? tagNames.join(", ") : "(none yet)"}`,
    `TITLE: ${input.title}`,
    `DESCRIPTION: ${(input.description || "").slice(0, 3000) || "(none)"}`,
    input.extra ? `CONTEXT: ${input.extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await groqJson(SYSTEM, user);
  if (!raw) return null;
  const parsed = suggestionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/// Existing tags matched case-insensitively, plus at most one new tag.
export async function resolveTags(committeeId: unknown, s: Suggestion, allowNew: boolean) {
  const tags = await TaskTag.find({ committeeId }).lean<any[]>();
  const byName = new Map(tags.map((t) => [String(t.name).toLowerCase(), t]));
  const picked = new Map<string, any>();
  for (const name of s.tags) {
    const tag = byName.get(name.trim().toLowerCase());
    if (tag) picked.set(str(tag._id), tag);
  }
  if (!picked.size && allowNew && s.newTag) {
    const name = s.newTag.trim();
    const existing = byName.get(name.toLowerCase());
    if (existing) picked.set(str(existing._id), existing);
    else if (tags.length < 40) {
      const color = TAG_COLORS[1 + (tags.length % (TAG_COLORS.length - 1))];
      const created = await TaskTag.create({ committeeId, name, color });
      picked.set(str(created._id), created);
    }
  }
  return Array.from(picked.values());
}

export function summary(tagNames: string[], priority: TaskPriority | null): string {
  const parts: string[] = [];
  if (tagNames.length) parts.push(`tagged this ${tagNames.join(", ")}`);
  if (priority) parts.push(`set priority to ${PRIORITY_LABEL[priority]}`);
  return parts.join(" and ");
}

/// Fills a task's empty tags and priority. Safe to call fire-and-forget.
export async function autoSortTask(taskId: unknown): Promise<boolean> {
  if (!groqEnabled()) return false;
  try {
    await connectDB();
    const task = await Task.findById(taskId).lean<any>();
    if (!task) return false;
    const needTags = !(task.tagIds || []).length;
    const needPriority = task.priority === "none";
    if (!needTags && !needPriority) return false;
    const tags = await TaskTag.find({ committeeId: task.committeeId }).select("name").lean<any[]>();
    const s = await suggestSort({ title: task.title, description: task.description }, tags.map((t) => t.name));
    if (!s || s.actionable === false) return false;

    const picked = needTags ? await resolveTags(task.committeeId, s, true) : [];
    const priority = needPriority && s.priority !== "none" ? s.priority : null;
    if (!picked.length && !priority) return false;

    // Only write fields that are still empty: someone may have edited meanwhile.
    const set: Record<string, unknown> = { autoSorted: true };
    const filter: Record<string, unknown> = { _id: task._id };
    if (picked.length) {
      set.tagIds = picked.map((t) => t._id);
      filter.tagIds = { $size: 0 };
    }
    if (priority) {
      set.priority = priority;
      if (!picked.length) filter.priority = "none";
    }
    const res = await Task.updateOne(filter, { $set: set });
    if (!res.modifiedCount) return false;
    await TaskActivity.create({
      taskId: task._id,
      committeeId: task.committeeId,
      actorId: null,
      kind: "auto_sorted",
      body: summary(picked.map((t) => t.name), priority),
      to: { tagIds: picked.map((t) => str(t._id)), priority },
    });
    await notifyRoster(task.committeeId);
    return true;
  } catch (err) {
    logger.warn({ err }, "Auto-sort failed");
    return false;
  }
}

/// Sorts up to `limit` open tasks that still have no tags.
export async function autoSortBacklog(committeeId: unknown, limit = 25): Promise<number> {
  const rows = await Task.find({
    committeeId,
    archivedAt: null,
    status: { $nin: ["done", "canceled"] },
    tagIds: { $size: 0 },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("_id")
    .lean<any[]>();
  let sorted = 0;
  for (const row of rows) if (await autoSortTask(row._id)) sorted++;
  return sorted;
}

async function notifyRoster(committeeId: unknown) {
  const committee = await Committee.findById(committeeId).select("committeeHeadId committeeMembers").lean<any>();
  const ids = new Set<string>([str(committee?.committeeHeadId), ...(committee?.committeeMembers || []).map(str)]);
  for (const id of ids) if (id) publishLive(id, "tasks");
}
