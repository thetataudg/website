// GET /api/report/TTDG-R2741: the report and its thread (reporter, subscriber or
// tech committee; internal notes only for the committee).
// PATCH { action }: reporter close/reopen; tech wont_fix, need_info, duplicate.
import { getBugReport, patchBugReport } from "@/lib/bugs/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { ref: string } };

export async function GET(req: Request, { params }: Ctx) {
  return handle(req, "Failed to load report", (member) => getBugReport(member, params.ref));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await jsonBody(req);
  return handle(req, "Failed to update report", (member) => patchBugReport(member, params.ref, body));
}
