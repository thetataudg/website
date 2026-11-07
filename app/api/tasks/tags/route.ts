// GET / POST /api/tasks/tags?committeeId=: a committee's tags.
import { createTag, listTags } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const committeeId = new URL(req.url).searchParams.get("committeeId");
  return handle(req, "Failed to list tags", (member) => listTags(member, committeeId));
}

export async function POST(req: Request) {
  const committeeId = new URL(req.url).searchParams.get("committeeId");
  const body = await jsonBody(req);
  return handle(req, "Failed to create tag", (member) => createTag(member, committeeId, body), 201);
}
