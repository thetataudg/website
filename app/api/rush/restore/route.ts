// POST /api/rush/restore { revisionIndex }: republish an earlier version.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { badRequest } from "@/lib/httpError";
import { restoreRushRevision } from "@/lib/rush/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({ revisionIndex: z.number().int().min(0).max(50) });

export async function POST(req: Request) {
  try {
    const member = await currentMember(req);
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) throw badRequest("Pick a version to restore");
    const state = await restoreRushRevision(member, parsed.data.revisionIndex);
    revalidatePath("/rush");
    return NextResponse.json(state);
  } catch (err: any) {
    logger.error({ err }, "Failed to restore rush page");
    return apiErrorResponse(err);
  }
}
