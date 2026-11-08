// GET /api/tasks/team?committeeId=: per-member workload (head, admin).
import { teamWorkload } from "@/lib/tasks/service";
import { handle } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const committeeId = new URL(req.url).searchParams.get("committeeId");
  return handle(req, "Failed to load team workload", (member) => teamWorkload(member, committeeId));
}
