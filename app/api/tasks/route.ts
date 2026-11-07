// GET /api/tasks: tasks on a committee's tracker (default: the tech
// committee), plus the roster and tags the views need. POST: create a task.
import { createTask, listTasks, type TaskFilter } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const list = (name: string) =>
    params.getAll(name).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const filter: TaskFilter = {
    committeeId: params.get("committeeId"),
    mine: params.get("mine") === "1" || params.get("mine") === "true",
    status: list("status") as TaskFilter["status"],
    assignee: params.get("assignee") || undefined,
    priority: list("priority") as TaskFilter["priority"],
    tag: params.get("tag") || undefined,
    due: (params.get("due") as TaskFilter["due"]) || undefined,
    q: params.get("q") || undefined,
    includeArchived: params.get("includeArchived") === "1",
    archivedOnly: params.get("archived") === "only",
  };
  return handle(req, "Failed to list tasks", (member) => listTasks(member, filter));
}

export async function POST(req: Request) {
  const body = await jsonBody(req);
  return handle(req, "Failed to create task", (member) => createTask(member, body), 201);
}
