// app/api/stripe/webhook/route.ts
// The authority on what happened to money.
//
// Three collections now hold Stripe payments — member self-checkout, in-person
// Tap to Pay, and donations — so the first job of this route is working out
// which one an event belongs to. Every intent this app creates carries a
// `metadata.kind` saying so. Refund and dispute events arrive as charges rather
// than intents and cannot be relied on to carry that metadata, so those resolve
// by looking the intent id up instead. Both paths are cheap and neither guesses.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { connectDB } from "@/lib/db";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import TerminalPayment from "@/lib/models/TerminalPayment";
import Donation from "@/lib/models/Donation";
import { getStripe } from "@/lib/stripe";
import {
  fulfillOnlineDuesPayment,
  reconcileOnlineDuesReversal,
} from "@/lib/onlineDuesPayments";
import {
  fulfillTerminalPayment,
  reconcileTerminalReversal,
  notifyTerminalFailure,
} from "@/lib/terminalPayments";
import { fulfillDonation, reconcileDonationReversal } from "@/lib/donations";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentKind = "dues" | "terminal" | "donation";

function intentId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

/// Intents created before `metadata.kind` existed are all member self-checkout,
/// which is why an unknown kind falls back to "dues" rather than erroring.
function kindFromMetadata(metadata: Stripe.Metadata | null | undefined): PaymentKind {
  const kind = String(metadata?.kind ?? "");
  if (kind === "terminal") return "terminal";
  if (kind === "donation" || kind === "terminal_donation") return "donation";
  return "dues";
}

/// For charge-shaped events, where metadata is not dependable: ask the
/// database which collection is holding this intent.
async function kindFromIntentId(id: string): Promise<PaymentKind | null> {
  const [dues, terminal, donation] = await Promise.all([
    OnlineDuesPayment.exists({ stripePaymentIntentId: id }),
    TerminalPayment.exists({ stripePaymentIntentId: id }),
    Donation.exists({ stripePaymentIntentId: id }),
  ]);
  // A terminal donation is held by both TerminalPayment and Donation. The
  // terminal reconciler owns it, because it is the one that also has ledger
  // rows to unwind, and it updates the donation itself.
  if (terminal) return "terminal";
  if (donation) return "donation";
  if (dues) return "dues";
  return null;
}

async function setStatus(
  kind: PaymentKind,
  id: string,
  patch: Record<string, any>
) {
  const filter = { stripePaymentIntentId: id };
  if (kind === "terminal") {
    const row = await TerminalPayment.findOneAndUpdate(filter, patch, { new: true });
    // A terminal donation's own row has to follow its payment.
    if (row?.donationId) {
      await Donation.findByIdAndUpdate(row.donationId, patch).catch(() => null);
    }
    return;
  }
  if (kind === "donation") {
    await Donation.findOneAndUpdate(filter, patch);
    return;
  }
  await OnlineDuesPayment.findOneAndUpdate(filter, patch);
}

async function fulfill(kind: PaymentKind, intent: Stripe.PaymentIntent) {
  if (kind === "terminal") return fulfillTerminalPayment(intent);
  if (kind === "donation") return fulfillDonation(intent);
  return fulfillOnlineDuesPayment(intent);
}

async function reverse(
  kind: PaymentKind,
  input: {
    paymentIntentId: string;
    refundedCents: number;
    disputed: boolean;
    disputeId?: string | null;
    disputeStatus?: string | null;
  }
) {
  if (kind === "terminal") return reconcileTerminalReversal(input);
  if (kind === "donation") return reconcileDonationReversal(input);
  return reconcileOnlineDuesReversal(input);
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
        await setStatus(kindFromMetadata(intent.metadata), intent.id, {
          status: "processing",
          failureMessage: "",
        });
        break;
      }
      case "payment_intent.succeeded": {
        const source = event.data.object as Stripe.PaymentIntent;
        const expanded = await getStripe().paymentIntents.retrieve(source.id, {
          expand: ["payment_method", "latest_charge"],
        });
        await fulfill(kindFromMetadata(expanded.metadata ?? source.metadata), expanded);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const kind = kindFromMetadata(intent.metadata);
        await setStatus(kind, intent.id, {
          status: "failed",
          failureMessage:
            intent.last_payment_error?.message || "The payment was declined",
        });
        // Requirement 5.12. Only for in-person payments: a member paying their
        // own dues online is looking at the screen that just told them.
        if (kind === "terminal") {
          await notifyTerminalFailure(intent.id);
        }
        break;
      }
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await setStatus(kindFromMetadata(intent.metadata), intent.id, {
          status: "canceled",
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const id = intentId(charge.payment_intent);
        if (id) {
          const kind = await kindFromIntentId(id);
          if (kind) {
            await reverse(kind, {
              paymentIntentId: id,
              refundedCents: charge.amount_refunded,
              disputed: Boolean(charge.disputed),
            });
          }
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
          const kind = await kindFromIntentId(id);
          if (kind) {
            await reverse(kind, {
              paymentIntentId: id,
              refundedCents: charge.amount_refunded,
              disputed:
                event.type === "charge.dispute.created" ||
                dispute.status !== "won",
              disputeId: dispute.id,
              disputeStatus: dispute.status,
            });
          }
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
