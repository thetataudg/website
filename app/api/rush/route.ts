// GET /api/rush: the published page (public). PUT: publish (rush editors).
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { getRushPageData, saveRushPage } from "@/lib/rush/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getRushPageData());
  } catch (err: any) {
    logger.error({ err }, "Failed to load rush page");
    return apiErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const member = await currentMember(req);
    const state = await saveRushPage(member, await req.json());
    // Production is one container, so this clears the cache that serves
    // /rush. The page's own `revalidate = 300` is the backstop.
    revalidatePath("/rush");
    return NextResponse.json(state);
  } catch (err: any) {
    logger.error({ err }, "Failed to save rush page");
    return apiErrorResponse(err);
  }
}
