// POST /api/rush/poster: upload a new poster (rush editors). Returns the key;
// the page only shows it once the editor saves.
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { forbidden } from "@/lib/httpError";
import { canEditRushPage } from "@/lib/rush/permissions";
import { storeImage } from "@/lib/storedImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const member = await currentMember(req);
    if (!(await canEditRushPage(member))) throw forbidden("Only the rush chair can do that");
    const form = await req.formData();
    const stored = await storeImage(form.get("file"), "rush", MAX_BYTES);
    return NextResponse.json(stored, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to upload rush poster");
    return apiErrorResponse(err);
  }
}
