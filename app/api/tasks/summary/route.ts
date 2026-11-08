// GET /api/tasks/summary?committeeId=: counts for the committee dashboard's
// Tasks card. `null` when the viewer cannot see that committee's tracker.
import { trackerSummary } from "@/lib/tasks/service";
import { handle } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const committeeId = new URL(req.url).searchParams.get("committeeId") || "";
  return handle(req, "Failed to load task summary", (member) => trackerSummary(member, committeeId));
}
