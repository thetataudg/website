// GET /api/report/similar?q=: up to three of my own open reports that look alike.
import { similarReports } from "@/lib/bugs/service";
import { handle } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  return handle(req, "Failed to find similar reports", (member) => similarReports(member, q));
}
