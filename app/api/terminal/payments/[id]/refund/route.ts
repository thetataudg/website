// app/api/terminal/payments/[id]/refund/route.ts
// Ask Stripe to refund an in-person payment.
//
// This route only asks. The ledger is put right by the `charge.refunded`
// webhook, through the same reconciler a dispute goes through, so there is
// exactly one code path that decides what a reversal means.
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import TerminalPayment from "@/lib/models/TerminalPayment";
import { requireTerminalOperator } from "@/lib/duesAuth";
import { serializeTerminalPayment } from "@/lib/terminalPayments";
import { readAmountCents } from "@/lib/dues";
import { formatCents } from "@/lib/financeEvents";
import { getStripe } from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let viewer;
  try {
    viewer = await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }

  try {
    await connectDB();
    const payment = await TerminalPayment.findById(params.id);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (!payment.stripePaymentIntentId || payment.status === "creating") {
      return NextResponse.json(
        { error: "This payment never went through, so there is nothing to refund" },
        { status: 409 }
      );
    }
    if (payment.status === "disputed") {
      return NextResponse.json(
        { error: "This payment is disputed. The dispute decides the money, not a refund." },
        { status: 409 }
      );
    }

    const alreadyRefunded = Number(payment.refundedCents) || 0;
    const refundable = Math.max(0, payment.principalCents - alreadyRefunded);
    if (refundable <= 0) {
      return NextResponse.json(
        { error: "This payment has already been refunded in full" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const requested = readAmountCents(body);
    const amountCents = requested === null ? refundable : requested;
    if (amountCents <= 0 || amountCents > refundable) {
      return NextResponse.json(
        {
          error: `You can refund up to ${formatCents(refundable)} on this payment.`,
          refundableCents: refundable,
        },
        { status: 400 }
      );
    }

    const reason = String(body?.reason ?? "").trim().slice(0, 200);
    await getStripe().refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: amountCents,
        metadata: {
          terminalPaymentId: String(payment._id),
          refundedBy: String(viewer._id),
          reason,
        },
      },
      { idempotencyKey: `terminal-refund-${payment._id}-${amountCents}` }
    );

    logger.info(
      {
        paymentId: String(payment._id),
        amountCents,
        actorId: String(viewer._id),
      },
      "Requested a refund on an in-person payment"
    );

    // Deliberately returns the row as it stands. The webhook moves it, and
    // reporting a state we have not been told about yet would be a guess.
    const fresh = await TerminalPayment.findById(params.id).lean<any>();
    return NextResponse.json({
      payment: serializeTerminalPayment(fresh),
      requestedCents: amountCents,
      pending: true,
    });
  } catch (err: any) {
    logger.error({ err, paymentId: params.id }, "Refund request failed");
    return NextResponse.json(
      { error: "Stripe couldn't start that refund" },
      { status: 502 }
    );
  }
}
