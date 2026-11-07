// PATCH / DELETE /api/tasks/TECH-14/comments/<id>: the author's own comment.
import { deleteComment, editComment } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { key: string; id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await jsonBody(req);
  return handle(req, "Failed to edit comment", (member) =>
    editComment(member, decodeURIComponent(params.key), params.id, body)
  );
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(req, "Failed to delete comment", (member) =>
    deleteComment(member, decodeURIComponent(params.key), params.id)
  );
}
