// PATCH / DELETE /api/tasks/tags/<id>: head or admin only.
import { deleteTag, updateTag } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await jsonBody(req);
  return handle(req, "Failed to update tag", (member) => updateTag(member, params.id, body));
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(req, "Failed to delete tag", (member) => deleteTag(member, params.id));
}
