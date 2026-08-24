// app/api/credit/me/route.ts
// What the chapter owes the signed-in member, and the entries behind it.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import CreditEntry from "@/lib/models/CreditEntry";
import { creditBalanceCents, serializeCreditEntry } from "@/lib/credit";
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
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const [creditCents, entries] = await Promise.all([
      creditBalanceCents(member._id),
      CreditEntry.find({ memberId: member._id })
        .sort({ occurredAt: -1 })
        .limit(50)
        .lean<any[]>(),
    ]);

    return NextResponse.json(
      {
        currency: "USD",
        creditCents,
        entries: entries.map(serializeCreditEntry),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to load credit for member");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
