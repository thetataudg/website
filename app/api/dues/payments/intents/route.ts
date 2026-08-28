import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import { currentDueAcross, partitionPlans } from "@/lib/plans";
import { initialAllocations, serializeOnlinePayment } from "@/lib/onlineDuesPayments";
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

    const [charges, plans] = await Promise.all([
      DuesCharge.find({ memberId: member._id }).lean<any[]>(),
      PaymentPlan.find({
        memberId: member._id,
        status: { $in: ["active", "pending"] },
      }).lean<any[]>(),
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
    let principalCents: number;
    if (requestedKind === "full") {
      principalCents = balanceCents;
    } else if (requestedKind === "installment") {
      principalCents = Math.min(balanceCents, due.amountDueNowCents || balanceCents);
    } else {
      principalCents = Math.round(Number(body?.amountCents));
    }
    if (!Number.isFinite(principalCents) || principalCents <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than zero" }, { status: 400 });
    }
    if (principalCents > balanceCents) {
      return NextResponse.json(
        { error: "Payment amount is greater than your remaining balance", balanceCents },
        { status: 409 }
      );
    }

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
