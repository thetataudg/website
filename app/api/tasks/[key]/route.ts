// GET /api/tasks/TECH-14: the task, its timeline and the tracker context.
// PATCH: partial update (the server diffs and writes activity).
// DELETE: head or admin only.
import { deleteTask, getTask, updateTask } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { key: string } };

export async function GET(req: Request, { params }: Ctx) {
  return handle(req, "Failed to load task", (member) => getTask(member, decodeURIComponent(params.key)));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await jsonBody(req);
  return handle(req, "Failed to update task", (member) =>
    updateTask(member, decodeURIComponent(params.key), body)
  );
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(req, "Failed to delete task", (member) => deleteTask(member, decodeURIComponent(params.key)));
}
