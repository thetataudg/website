// POST /api/tasks/TECH-14/comments { body }
import { addComment } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  const body = await jsonBody(req);
  return handle(req, "Failed to comment", (member) => addComment(member, decodeURIComponent(params.key), body), 201);
}
