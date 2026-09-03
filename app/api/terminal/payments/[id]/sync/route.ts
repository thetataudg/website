// app/api/terminal/payments/[id]/sync/route.ts
// Reconcile one in-person payment with Stripe, straight after the phone
// confirms it.
//
// The webhook is still the authority and everything it calls is idempotent, so
// the two can race safely. This exists because the webhook is not fast, and the
// officer is standing in front of the person who just paid. A screen that shows
// no trace of money somebody watched leave their card is the worst moment this
// feature has.
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import TerminalPayment from "@/lib/models/TerminalPayment";
import { requireTerminalOperator } from "@/lib/duesAuth";
import {
  fulfillTerminalPayment,
  serializeTerminalPayment,
} from "@/lib/terminalPayments";
import { getStripe } from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }

  await connectDB();
  const payment = await TerminalPayment.findById(params.id);
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // Stamped first, so the payment reads as confirmed even if Stripe is
  // unreachable on this call.
  if (!payment.confirmedAt) {
    payment.confirmedAt = new Date();
    await payment.save();
  }
  // The phone knows which reader took it; Stripe's charge object does not
  // reliably say.
  const body = await req.json().catch(() => ({}));
  const readerSerial = String(body?.readerSerial ?? "").trim().slice(0, 120);
  if (readerSerial && !payment.readerSerial) {
    payment.readerSerial = readerSerial;
    await payment.save();
  }

  // What the phone saw. The reader can refuse a card without the intent ever
  // carrying a `last_payment_error`, and the app is deliberately vague in
  // front of the cardholder, so the reason it did not say out loud is written
  // down here instead. Stripe's own wording still wins when it has any.
  const reportedFailure = String(body?.failureMessage ?? "").trim().slice(0, 500);
  const reportedDeclineCode = String(body?.declineCode ?? "").trim().slice(0, 60);

  if (payment.stripePaymentIntentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(
        payment.stripePaymentIntentId,
        { expand: ["latest_charge", "payment_method"] }
      );
      if (intent.status === "succeeded") {
        await fulfillTerminalPayment(intent);
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
          intent.last_payment_error.message ||
          reportedFailure ||
          "The card was declined";
        payment.declineCode =
          (intent.last_payment_error as any)?.decline_code ||
          reportedDeclineCode ||
          "";
        await payment.save();
      } else if (reportedFailure) {
        // Stripe has nothing to say and the phone does. This is the reader
        // refusing a card, or the app losing the network mid-confirm: either
        // way the attempt happened and belongs in the log rather than sitting
        // as an intent that looks like nobody ever tried.
        payment.status = "failed";
        payment.failureMessage = reportedFailure;
        payment.declineCode = reportedDeclineCode;
        await payment.save();
      }
    } catch (err: any) {
      if (reportedFailure && payment.status !== "succeeded") {
        payment.status = "failed";
        payment.failureMessage = reportedFailure;
        payment.declineCode = reportedDeclineCode;
        await payment.save();
      }
      // The webhook will still settle this.
      logger.warn(
        { err, paymentId: params.id },
        "Could not sync a terminal payment with Stripe"
      );
    }
  }

  const fresh = await TerminalPayment.findById(params.id).lean<any>();
  return NextResponse.json({ payment: serializeTerminalPayment(fresh) });
}
