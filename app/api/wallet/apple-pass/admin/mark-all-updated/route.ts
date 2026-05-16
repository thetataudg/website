import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { markAllWalletPassesUpdated } from "@/lib/walletPassStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req as any, ["superadmin", "admin"]);
    await connectDB();

    const result = await markAllWalletPassesUpdated();

    logger.info(
      {
        actorId: actor.clerkId,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        lastUpdatedTag: result.lastUpdatedTag,
      },
      "Marked all Apple Wallet passes as updated"
    );

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.warn({ err }, "Failed to mark all Apple Wallet passes as updated");
    return NextResponse.json(
      { error: err?.message || "Failed to mark all Apple Wallet passes as updated" },
      { status: err?.statusCode || 500 }
    );
  }
}
