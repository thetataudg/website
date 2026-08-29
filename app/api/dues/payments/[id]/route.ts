import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import {
  fulfillOnlineDuesPayment,
  serializeOnlinePayment,
} from "@/lib/onlineDuesPayments";
import { getStripe } from "@/lib/stripe";
import logger from "@/lib/logger";

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


/// Reconciles one payment with Stripe on demand, straight after the member
/// finishes the payment sheet.
///
/// The webhook is still the authority — it is the only path that runs when the
/// member closes the tab, and everything it calls is idempotent so both paths
/// can race safely. This exists because the webhook is not *fast*: a card can
/// be authorized and the member back on their ledger a full second or two
/// before `payment_intent.succeeded` is delivered, and a ledger that shows no
/// trace of money you just paid is the single worst moment this feature has.
/// Stamping `confirmedAt` first means the payment reads as pending even if
/// Stripe is unreachable on this call.
export async function POST(req: Request, { params }: { params: { id: string } }) {
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
  });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  if (!payment.confirmedAt) {
    payment.confirmedAt = new Date();
    await payment.save();
  }

  if (payment.stripePaymentIntentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(
        payment.stripePaymentIntentId,
        { expand: ["payment_method", "latest_charge"] }
      );
      if (intent.status === "succeeded") {
        await fulfillOnlineDuesPayment(intent);
      } else if (intent.status === "processing") {
        payment.status = "processing";
        payment.failureMessage = "";
        await payment.save();
      } else if (intent.status === "canceled") {
        payment.status = "canceled";
        await payment.save();
      } else if (intent.last_payment_error) {
        payment.status = "failed";
        payment.failureMessage =
          intent.last_payment_error.message || "The payment was declined";
        await payment.save();
      }
    } catch (err: any) {
      // The webhook will still settle this; the member sees it as pending
      // meanwhile, which is the truthful thing to show either way.
      logger.warn(
        { err, paymentId: params.id },
        "Could not sync dues payment with Stripe"
      );
    }
  }

  const fresh = await OnlineDuesPayment.findById(params.id).lean<any>();
  return NextResponse.json({ payment: serializeOnlinePayment(fresh) });
}
