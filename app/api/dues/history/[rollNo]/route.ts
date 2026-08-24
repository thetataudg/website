// app/api/dues/history/[rollNo]/route.ts
// An officer reading somebody else's trail. Same shape the member sees of their
// own — there is deliberately no second, fuller version for officers, because a
// record the member can't see isn't one they can dispute.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { requireTreasury } from "@/lib/duesAuth";
import { financeHistoryFor } from "@/lib/financeHistory";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { rollNo: string } }
) {
  try {
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ rollNo: params.rollNo })
      .select("_id rollNo fName lName")
      .lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
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
