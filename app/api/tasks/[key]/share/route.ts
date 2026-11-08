// POST /api/tasks/TTDG-7K2M/share { public: true | false }: turns the public
// read-only link on (returns its token) or off.
import { setTaskShare } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  const body = await jsonBody(req);
  return handle(req, "Failed to share task", (member) =>
    setTaskShare(member, decodeURIComponent(params.key), body)
  );
}
