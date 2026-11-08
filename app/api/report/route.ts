// GET /api/report: my reports (as reporter or subscriber). POST: file one.
import { clientKey } from "@/lib/rateLimit";
import { createBugReport, listMyReports } from "@/lib/bugs/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(req, "Failed to list reports", (member) => listMyReports(member));
}

export async function POST(req: Request) {
  const body = await jsonBody(req);
  return handle(req, "Failed to file report", (member) =>
    createBugReport(member, body, { ip: clientKey(req) }), 201);
}
