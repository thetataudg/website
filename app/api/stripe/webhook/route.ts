import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { connectDB } from "@/lib/db";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import { getStripe } from "@/lib/stripe";
import {
  fulfillOnlineDuesPayment,
  reconcileOnlineDuesReversal,
} from "@/lib/onlineDuesPayments";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intentId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    logger.warn({ err }, "Rejected Stripe webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await connectDB();
    switch (event.type) {
      case "payment_intent.processing": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await OnlineDuesPayment.findOneAndUpdate(
          { stripePaymentIntentId: intent.id },
          { status: "processing", failureMessage: "" }
        );
        break;
      }
      case "payment_intent.succeeded": {
        const source = event.data.object as Stripe.PaymentIntent;
        const expanded = await getStripe().paymentIntents.retrieve(source.id, {
          expand: ["payment_method", "latest_charge"],
        });
        await fulfillOnlineDuesPayment(expanded);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await OnlineDuesPayment.findOneAndUpdate(
          { stripePaymentIntentId: intent.id },
          {
            status: "failed",
            failureMessage:
              intent.last_payment_error?.message || "The payment was declined",
          }
        );
        break;
      }
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await OnlineDuesPayment.findOneAndUpdate(
          { stripePaymentIntentId: intent.id },
          { status: "canceled" }
        );
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const id = intentId(charge.payment_intent);
        if (id) {
          await reconcileOnlineDuesReversal({
            paymentIntentId: id,
            refundedCents: charge.amount_refunded,
            disputed: Boolean(charge.disputed),
          });
        }
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge =
          typeof dispute.charge === "string"
            ? await getStripe().charges.retrieve(dispute.charge)
            : dispute.charge;
        const id = intentId(charge.payment_intent);
        if (id) {
          await reconcileOnlineDuesReversal({
            paymentIntentId: id,
            refundedCents: charge.amount_refunded,
            disputed:
              event.type === "charge.dispute.created" ||
              dispute.status !== "won",
            disputeId: dispute.id,
            disputeStatus: dispute.status,
          });
        }
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    logger.error({ err, eventId: event.id, eventType: event.type }, "Stripe webhook failed");
    // Stripe retries non-2xx deliveries.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
