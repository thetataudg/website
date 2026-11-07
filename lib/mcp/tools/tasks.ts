// lib/mcp/tools/tasks.ts
// The committee task tracker and the bug report triage queue. Every tool
// calls the same service layer as the website (lib/tasks/service.ts,
// lib/bugs/service.ts), which re-checks access with `assertTrackerAccess`
// against the signed-in member.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PRIORITIES, STATUSES } from "@/lib/tasks/constants";
import {
  addComment,
  createTask,
  getTask,
  listTasks,
  updateTask,
} from "@/lib/tasks/service";
import {
  acceptBugReport,
  getBugReport,
  listTriage,
  patchBugReport,
} from "@/lib/bugs/service";
import { READ_ONLY, ToolError, WRITE, defineTool, type McpContext } from "@/lib/mcp/tool";
import { requireCommittee, requireMember } from "@/lib/mcp/resolve";

/// Committee name or id to an id; omitted means the tech committee.
async function committeeIdFor(ref?: string): Promise<string | null> {
  if (!ref) return null;
  const committee = await requireCommittee(ref);
  return String(committee._id);
}

/// Member ids, roll numbers or full names to member ids.
async function memberIds(refs?: string[]): Promise<string[] | undefined> {
  if (!refs) return undefined;
  const ids: string[] = [];
  for (const ref of refs) ids.push(String((await requireMember(ref))._id));
  return ids;
}

/// Tag names to ids on the task's committee (created if missing).
async function tagIdsFor(ctx: McpContext, committeeId: string | null, names?: string[]) {
  if (!names) return undefined;
  const { createTag } = await import("@/lib/tasks/service");
  const ids: string[] = [];
  for (const name of names) ids.push((await createTag(ctx.member, committeeId, { name })).id);
  return ids;
}

const brief = (t: any) => ({
  key: t.key,
  title: t.title,
  status: t.status,
  priority: t.priority,
  assignees: t.assigneeIds,
  due: t.dueLabel,
  overdue: t.dueState === "overdue",
  staleDays: t.staleLevel ? t.staleDays : 0,
  bugReport: Boolean(t.bugReportId),
});

export function registerTaskTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "list_tasks", {
    title: "List tasks",
    description:
      "Tasks on a committee's tracker (default: the tech committee). Filter by status, assignee (id, roll number, full name, or 'none'), mine, priority, due ('overdue' | 'week' | 'none') and search text. Returns keys like TTDG-7K2M plus the roster so assignee ids can be named.",
    input: {
      committee: z.string().optional().describe("Committee name or id. Default: the tech committee."),
      mine: z.boolean().optional(),
      status: z.array(z.enum(STATUSES)).optional(),
      assignee: z.string().optional(),
      priority: z.array(z.enum(PRIORITIES)).optional(),
      due: z.enum(["overdue", "week", "none"]).optional(),
      q: z.string().optional(),
    },
    annotations: READ_ONLY,
    run: async (args, c) => {
      const assignee =
        args.assignee === "none" ? "none" : args.assignee ? String((await requireMember(args.assignee))._id) : undefined;
      const { tasks, context } = await listTasks(c.member, {
        committeeId: await committeeIdFor(args.committee),
        mine: args.mine,
        status: args.status,
        assignee,
        priority: args.priority,
        due: args.due,
        q: args.q,
      });
      return {
        committee: context.committee.name,
        roster: context.members.map((m) => ({ id: m.id, name: m.name, head: m.isHead })),
        tags: context.tags,
        count: tasks.length,
        tasks: tasks.map(brief),
      };
    },
  });

  defineTool(server, ctx, "get_task", {
    title: "Get task",
    description: "One task by key (TTDG-7K2M) with its description, checklist and full activity timeline.",
    input: { key: z.string() },
    annotations: READ_ONLY,
    run: async (args, c) => {
      const { task, activity } = await getTask(c.member, args.key);
      return { task, activity };
    },
  });

  defineTool(server, ctx, "create_task", {
    title: "Create task",
    description:
      "Create a task on a committee's tracker (default: the tech committee). Assignees must be on that committee; they are notified. dueDate is YYYY-MM-DD (all day, Arizona time).",
    input: {
      committee: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assignees: z.array(z.string()).optional().describe("Member ids, roll numbers or full names."),
      tags: z.array(z.string()).optional().describe("Tag names; missing tags are created."),
      dueDate: z.string().optional(),
    },
    annotations: WRITE,
    run: async (args, c) => {
      const committeeId = await committeeIdFor(args.committee);
      const task = await createTask(c.member, {
        committeeId,
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        assigneeIds: await memberIds(args.assignees),
        tagIds: await tagIdsFor(c, committeeId, args.tags),
        dueDate: args.dueDate ?? null,
      });
      return brief(task);
    },
  });

  defineTool(server, ctx, "update_task", {
    title: "Update task",
    description:
      "Change a task's fields. Pass only what changes. assignees and tags replace the whole list. dueDate null clears the due date. archived true hides it from the board.",
    input: {
      key: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assignees: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      dueDate: z.string().nullable().optional(),
      archived: z.boolean().optional(),
    },
    annotations: WRITE,
    run: async (args, c) => {
      const { task } = await getTask(c.member, args.key);
      const patch: Record<string, unknown> = {};
      for (const field of ["title", "description", "status", "priority", "archived"] as const) {
        if (args[field] !== undefined) patch[field] = args[field];
      }
      if (args.assignees) patch.assigneeIds = await memberIds(args.assignees);
      if (args.tags) patch.tagIds = await tagIdsFor(c, task.committeeId, args.tags);
      if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
      if (!Object.keys(patch).length) throw new ToolError("Nothing to change.");
      return brief(await updateTask(c.member, args.key, patch));
    },
  });

  defineTool(server, ctx, "comment_on_task", {
    title: "Comment on task",
    description:
      "Add a comment to a task's timeline. Assignees and the creator are notified. Markdown is fine. Do not use em dashes.",
    input: { key: z.string(), body: z.string() },
    annotations: WRITE,
    run: async (args, c) => addComment(c.member, args.key, { body: args.body }),
  });

  defineTool(server, ctx, "list_bug_reports", {
    title: "List bug reports",
    description:
      "Tech committee only. view 'new' (default): reports waiting for triage; 'open': everything not closed; 'all'. Pass ref to get one report with its full thread, internal notes included.",
    input: {
      view: z.enum(["new", "open", "all"]).optional(),
      ref: z.string().optional().describe("TTDG-R2741"),
    },
    annotations: READ_ONLY,
    run: async (args, c) => {
      if (args.ref) {
        const result = await getBugReport(c.member, args.ref);
        if (!result.isStaff) throw new ToolError("Only the tech committee can triage reports.");
        return result;
      }
      return listTriage(c.member, { view: args.view });
    },
  });

  defineTool(server, ctx, "triage_bug_report", {
    title: "Triage bug report",
    description:
      "Tech committee only. accept: creates a linked task on the tech tracker (its status then drives what the reporter sees). duplicate: needs of (TTDG-R1203). wont_fix: optional message to the reporter. need_info: message to the reporter is required. Messages are shown to the reporter, so show the user the wording first.",
    input: {
      ref: z.string(),
      action: z.enum(["accept", "duplicate", "wont_fix", "need_info"]),
      of: z.string().optional(),
      message: z.string().optional(),
      priority: z.enum(PRIORITIES).optional(),
      assignees: z.array(z.string()).optional(),
    },
    annotations: WRITE,
    run: async (args, c) => {
      if (args.action === "accept") {
        return acceptBugReport(c.member, args.ref, {
          priority: args.priority,
          assigneeIds: await memberIds(args.assignees),
        });
      }
      if (args.action === "duplicate") {
        if (!args.of) throw new ToolError("Pass of: the original report's ref.");
        return (await patchBugReport(c.member, args.ref, { action: "duplicate", of: args.of })).report;
      }
      if (args.action === "need_info" && !args.message) throw new ToolError("Pass the message to the reporter.");
      return (
        await patchBugReport(c.member, args.ref, { action: args.action, message: args.message })
      ).report;
    },
  });
}
