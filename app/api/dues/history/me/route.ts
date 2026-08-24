// app/api/dues/history/me/route.ts
// A member's own paper trail. Needs no treasury role — this is their record as
// much as the chapter's, and being able to read it is the point.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { financeHistoryFor } from "@/lib/financeHistory";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId })
      .select("_id rollNo fName lName")
      .lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const history = await financeHistoryFor(member, {
      term: searchParams.get("term") || undefined,
      limit: Number(searchParams.get("limit")) || undefined,
    });
    return NextResponse.json(history, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to load finance history");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
