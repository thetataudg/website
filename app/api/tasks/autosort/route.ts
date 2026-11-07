// POST /api/tasks/autosort?committee=<id>: the head (or an officer) asks
// Groq to tag and prioritize open tasks that have no tags yet.
import { HttpError } from "@/lib/httpError";
import { groqEnabled } from "@/lib/ai/groq";
import { autoSortBacklog } from "@/lib/tasks/autosort";
import { assertTrackerAccess } from "@/lib/tasks/permissions";
import { trackerCommittee } from "@/lib/tasks/service";
import { handle } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const committeeId = new URL(req.url).searchParams.get("committee");
  return handle(req, "Failed to auto-sort", async (member) => {
    const committee = await trackerCommittee(committeeId);
    assertTrackerAccess(member, committee, "manage");
    if (!groqEnabled()) throw new HttpError(503, "Auto-sort is off. Set GROQ_API_KEY to turn it on.");
    return { sorted: await autoSortBacklog(committee._id) };
  });
}
