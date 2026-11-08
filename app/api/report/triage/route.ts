// GET /api/report/triage?view=new|open|all: tech committee only.
import { listTriage } from "@/lib/bugs/service";
import { handle } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const view = (new URL(req.url).searchParams.get("view") as "new" | "open" | "all") || "open";
  return handle(req, "Failed to load triage", (member) => listTriage(member, { view }));
}
