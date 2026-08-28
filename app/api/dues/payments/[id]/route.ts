import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import { serializeOnlinePayment } from "@/lib/onlineDuesPayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }
  await connectDB();
  const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
  if (!member) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const payment = await OnlineDuesPayment.findOne({
    _id: params.id,
    memberId: member._id,
  }).lean<any>();
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ payment: serializeOnlinePayment(payment) });
}

