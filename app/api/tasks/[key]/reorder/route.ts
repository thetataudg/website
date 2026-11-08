// POST /api/tasks/TECH-14/reorder { status, beforeId, afterId }: board drag.
import { reorderTask } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  const body = await jsonBody(req);
  return handle(req, "Failed to reorder task", (member) =>
    reorderTask(member, decodeURIComponent(params.key), body)
  );
}
