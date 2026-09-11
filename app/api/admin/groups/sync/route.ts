// app/api/admin/groups/sync/route.ts
// Manual Google Groups sync, admins only.
//
// GET shows what would change and changes nothing. POST applies it, including
// large removals the automatic runs refuse, so the first reshuffle of the
// newsletter and minutes lists is one an admin looked at first.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { syncChapterGroups } from "@/lib/googleGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request, apply: boolean) {
  try {
    await connectDB();
    await requireAdmin(req as any);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Not authorized" },
      { status: err?.statusCode || 401 }
    );
  }

  try {
    const plans = await syncChapterGroups({ apply, allowMassRemoval: apply });
    if (!plans) {
      return NextResponse.json(
        { error: "Google Groups sync isn't set up yet (service account delegation or GOOGLE_GROUPS_ADMIN_EMAIL)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ applied: apply, groups: plans }, { status: 200 });
  } catch (err: any) {
    logger.error({ err, apply }, "Manual Google Groups sync failed");
    return NextResponse.json({ error: err?.message || "Sync failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req, false);
}

export async function POST(req: Request) {
  return handle(req, true);
}
