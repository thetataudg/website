import { connectDB } from "@/lib/db";
import { buildFamilyTree } from "@/lib/family-tree-utils";
import { NextResponse } from "next/server";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const tree = await buildFamilyTree();

    return NextResponse.json(tree, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch family tree");
    return NextResponse.json({ error: "Failed to fetch family tree" }, { status: 500 });
  }
}