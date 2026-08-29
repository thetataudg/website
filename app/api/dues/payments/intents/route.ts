import { formatCents } from "@/lib/financeEvents";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import { currentDueAcross, partitionPlans } from "@/lib/plans";
import {
  initialAllocations,
  onlinePaymentAvailability,
  pendingOnlinePrincipalCents,
  serializeOnlinePayment,
} from "@/lib/onlineDuesPayments";
import {
  getStripe,
  onlineDuesPaymentsEnabled,
  stripePublishableKey,
} from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["installment", "custom", "full"]);

export async function POST(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  if (!onlineDuesPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Online payments are coming soon. Please use an offline payment method for now." },
      { status: 503 }
    );
  }

  let localPayment: any = null;
  try {
    await connectDB();
    const member = await Member.findOne({ clerkId })
      .select("_id rollNo fName lName email")
      .lean<any>();
    if (!member) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const body = await req.json();
    const requestedKind = String(body?.kind || "");
    if (!KINDS.has(requestedKind)) {
      return NextResponse.json(
        { error: 'kind must be "installment", "custom", or "full"' },
        { status: 400 }
      );
    }

    const [charges, plans, onlinePayments] = await Promise.all([
      DuesCharge.find({ memberId: member._id }).lean<any[]>(),
      PaymentPlan.find({
        memberId: member._id,
        status: { $in: ["active", "pending"] },
      }).lean<any[]>(),
      OnlineDuesPayment.find({
        memberId: member._id,
        ledgerPostedAt: null,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean<any[]>(),
    ]);
    const openCharges = charges.filter(
      (charge) => charge.status === "open" && balanceCentsFor(charge) > 0
    );
    const balanceCents = openCharges.reduce(
      (sum, charge) => sum + balanceCentsFor(charge),
      0
    );
    if (balanceCents <= 0) {
      return NextResponse.json({ error: "Your dues are already settled" }, { status: 409 });
    }

    const now = new Date();
    const { live } = partitionPlans(plans, charges, now);
    const due = currentDueAcross(live, charges, null, now);
    const availability = onlinePaymentAvailability(
      balanceCents,
      due.amountDueNowCents,
      pendingOnlinePrincipalCents(onlinePayments)
    );
    // Nothing owed is the only reason to refuse outright now. Money already
    // in flight no longer blocks a payment; see `onlinePaymentAvailability`.
    if (availability.payableBalanceCents <= 0) {
      return NextResponse.json(
        {
          error: "You don't have a balance to pay right now",
          ...availability,
        },
        { status: 409 }
      );
    }
    let principalCents: number;
    if (requestedKind === "full") {
      principalCents = availability.payableBalanceCents;
    } else if (requestedKind === "installment") {
      principalCents = availability.payableDueNowCents;
    } else {
      principalCents = Math.round(Number(body?.amountCents));
    }
    if (!Number.isFinite(principalCents) || principalCents <= 0) {
      return NextResponse.json(
        {
          error: requestedKind === "installment"
            ? "Nothing is due right now. Choose the remaining balance or another amount."
            : "Payment amount must be greater than zero",
          ...availability,
        },
        { status: 400 }
      );
    }
    if (principalCents > availability.payableBalanceCents) {
      return NextResponse.json(
        {
          // The one ceiling that survives: you cannot pay more than you owe.
          error: `That's more than the ${formatCents(availability.payableBalanceCents)} left on your balance.`,
          ...availability,
        },
        { status: 409 }
      );
    }

    // The member's own words about this money, kept verbatim and shown to
    // the treasurer. Capped because it also rides along in Stripe metadata,
    // where values are limited to 500 characters.
    const note = String(body?.note ?? "").trim().slice(0, 500);

    // Fee pass-through is deliberately zero until the chapter adopts a
    // compliant credit-only surcharge policy. ACH and debit cannot be treated
    // as credit-card surcharges.
    const feeCents = 0;
    const totalCents = principalCents + feeCents;
    localPayment = await OnlineDuesPayment.create({
      memberId: member._id,
      requestedKind,
      principalCents,
      feeCents,
      totalCents,
      currency: "usd",
      note,
      allocations: initialAllocations(openCharges, principalCents),
      status: "creating",
    });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        payment_method_types: ["card", "us_bank_account"],
        description: `Theta Tau dues for ${member.fName} ${member.lName}`.trim(),
        receipt_email: member.email || undefined,
        metadata: {
          onlineDuesPaymentId: String(localPayment._id),
          note,
          memberId: String(member._id),
          rollNo: String(member.rollNo || ""),
          principalCents: String(principalCents),
        },
      },
      { idempotencyKey: `dues-payment-${localPayment._id}` }
    );
    localPayment.stripePaymentIntentId = intent.id;
    localPayment.status = intent.status;
    await localPayment.save();

    return NextResponse.json(
      {
        payment: serializeOnlinePayment(localPayment),
        clientSecret: intent.client_secret,
        publishableKey: stripePublishableKey(),
        merchantIdentifier:
          process.env.STRIPE_APPLE_MERCHANT_ID ?? "merchant.org.thetatau.dg.ThetaTau",
        merchantCountryCode: "US",
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (localPayment?._id && !localPayment?.stripePaymentIntentId) {
      await OnlineDuesPayment.findByIdAndUpdate(localPayment._id, {
        status: "failed",
        failureMessage: "Stripe could not start this payment",
      }).catch(() => null);
    }
    logger.error({ err }, "Failed to create dues PaymentIntent");
    const unavailable = /Stripe is not configured|publishable key/i.test(err?.message || "");
    return NextResponse.json(
      { error: unavailable ? "Online payments are not configured" : "Couldn't start the payment" },
      { status: unavailable ? 503 : 500 }
    );
  }
}
