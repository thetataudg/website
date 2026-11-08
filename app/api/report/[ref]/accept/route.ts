// POST /api/report/TTDG-R2741/accept: tech committee only. Creates the linked task.
import { acceptBugReport } from "@/lib/bugs/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { ref: string } }) {
  const body = await jsonBody(req);
  return handle(req, "Failed to accept report", (member) => acceptBugReport(member, params.ref, body), 201);
}
