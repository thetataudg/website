// POST /api/report/TTDG-R2741/messages { body, visibility, screenshotKeys }
// Reporters can only post in public; the tech committee chooses.
import { addBugMessage } from "@/lib/bugs/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { ref: string } }) {
  const body = await jsonBody(req);
  return handle(req, "Failed to post reply", (member) => addBugMessage(member, params.ref, body), 201);
}
