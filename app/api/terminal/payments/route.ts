// app/api/terminal/payments/route.ts
// Start an in-person card payment, or list the ones already taken.
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import TerminalPayment from "@/lib/models/TerminalPayment";
import Donation from "@/lib/models/Donation";
import { requireTerminalOperator } from "@/lib/duesAuth";
import { readAmountCents } from "@/lib/dues";
import { formatCents } from "@/lib/financeEvents";
import {
  isUnassignedTerminalPayment,
  serializeTerminalPayment,
} from "@/lib/terminalPayments";
import {
  isDonationDesignation,
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
} from "@/lib/donations";
import { getStripe, terminalLocationId, terminalPaymentsEnabled } from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSES = new Set(["charge", "member", "general", "donation"]);
/// Stripe will not authorize a card for less than 50 cents.
const MIN_CENTS = 50;

export async function GET(req: Request) {
  try {
    await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const filter: any = {};

    // The queue the roster badges: settled money nobody owns yet.
    if (searchParams.get("unassigned") === "true") {
      filter.memberId = null;
      filter.purpose = { $ne: "donation" };
      filter.status = { $in: ["succeeded", "partially_refunded"] };
    }

    const memberId = searchParams.get("memberId");
    if (memberId) {
      if (!mongoose.Types.ObjectId.isValid(memberId)) {
        return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
      }
      filter.memberId = memberId;
    }
    const status = searchParams.get("status");
    if (status) filter.status = status;

    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100));
    const rows = await TerminalPayment.find(filter)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limit)
      .lean<any[]>();

    // One lookup for the whole page rather than a populate per row.
    const memberIds = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.memberId, row.operatorId])
          .filter(Boolean)
          .map((id: any) => String(id))
      )
    );
    const members = memberIds.length
      ? await Member.find({ _id: { $in: memberIds } })
          .select("rollNo fName lName")
          .lean<any[]>()
      : [];
    const byId = new Map(members.map((m) => [String(m._id), m]));
    const name = (id: any) => {
      const m = id ? byId.get(String(id)) : null;
      return m ? { rollNo: m.rollNo, fName: m.fName, lName: m.lName } : null;
    };

    const payments = rows.map((row) => ({
      ...serializeTerminalPayment(row),
      member: name(row.memberId),
      operator: name(row.operatorId),
    }));

    const unassigned = rows.filter(isUnassignedTerminalPayment);
    return NextResponse.json({
      payments,
      totals: {
        currency: "USD",
        count: payments.length,
        unassignedCount: unassigned.length,
        unassignedCents: unassigned.reduce(
          (sum, row) => sum + (Number(row.principalCents) || 0),
          0
        ),
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to list terminal payments");
    return NextResponse.json({ error: "Couldn't load payments" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let viewer;
  try {
    viewer = await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  if (!terminalPaymentsEnabled()) {
    return NextResponse.json(
      { error: "In-person card payments aren't switched on yet" },
      { status: 503 }
    );
  }

  let localPayment: any = null;
  let localDonation: any = null;
  try {
    await connectDB();
    const body = await req.json();

    const purpose = String(body?.purpose || "");
    if (!PURPOSES.has(purpose)) {
      return NextResponse.json(
        { error: 'purpose must be "charge", "member", "general", or "donation"' },
        { status: 400 }
      );
    }

    const principalCents = readAmountCents(body);
    if (principalCents === null || principalCents < MIN_CENTS) {
      return NextResponse.json(
        { error: `A card payment has to be at least ${formatCents(MIN_CENTS)}` },
        { status: 400 }
      );
    }

    const description = String(body?.description ?? "").trim().slice(0, 200);
    const note = String(body?.note ?? "").trim().slice(0, 500);
    const payerName = String(body?.payerName ?? "").trim().slice(0, 120);
    const payerEmail = String(body?.payerEmail ?? "").trim().slice(0, 200);

    // --- resolve the target -------------------------------------------------
    let memberId: any = null;
    let chargeId: any = null;

    if (purpose === "charge") {
      if (!mongoose.Types.ObjectId.isValid(String(body?.chargeId))) {
        return NextResponse.json({ error: "Invalid chargeId" }, { status: 400 });
      }
      const charge = await DuesCharge.findById(body.chargeId).lean<any>();
      if (!charge) {
        return NextResponse.json({ error: "Charge not found" }, { status: 404 });
      }
      const balance = balanceCentsFor(charge);
      if (balance <= 0) {
        return NextResponse.json(
          { error: "That charge is already settled" },
          { status: 409 }
        );
      }
      // The one ceiling in this route. Everywhere else an officer may
      // legitimately be collecting for something that is not a charge yet, but
      // "pay this charge" must not quietly take more than the charge is worth.
      if (principalCents > balance) {
        return NextResponse.json(
          {
            error: `That's more than the ${formatCents(balance)} left on this charge.`,
            balanceCents: balance,
          },
          { status: 409 }
        );
      }
      memberId = charge.memberId;
      chargeId = charge._id;
    } else if (purpose === "member") {
      if (!mongoose.Types.ObjectId.isValid(String(body?.memberId))) {
        return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
      }
      const member = await Member.findById(body.memberId).select("_id").lean<any>();
      if (!member) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      memberId = member._id;
    }

    // The Stripe receipt is the only receipt an in-person payer gets, and it
    // is only sent when the intent carries an address. An officer holding a
    // card at a table should not have to retype an address the chapter
    // already holds, so a member's own address stands in when none was typed.
    // Kept out of `payerEmail` on the row: that field is what somebody
    // entered by hand, and a lookup is not that.
    let receiptEmail = payerEmail;
    if (!receiptEmail && memberId) {
      const owner = await Member.findById(memberId).select("email").lean<any>();
      receiptEmail = String(owner?.email ?? "").trim();
    }

    // --- a gift taken at a table -------------------------------------------
    if (purpose === "donation") {
      if (
        principalCents < MIN_DONATION_CENTS ||
        principalCents > MAX_DONATION_CENTS
      ) {
        return NextResponse.json(
          {
            error: `A donation has to be between ${formatCents(MIN_DONATION_CENTS)} and ${formatCents(MAX_DONATION_CENTS)}`,
          },
          { status: 400 }
        );
      }
      const designation = String(body?.designation ?? "general");
      if (!isDonationDesignation(designation)) {
        return NextResponse.json({ error: "Unknown designation" }, { status: 400 });
      }
      localDonation = await Donation.create({
        donorMemberId: mongoose.Types.ObjectId.isValid(String(body?.memberId))
          ? body.memberId
          : null,
        donorName: payerName,
        donorEmail: payerEmail,
        amountCents: principalCents,
        designation,
        message: note,
        isAnonymous: Boolean(body?.isAnonymous),
        channel: "terminal",
        status: "creating",
      });
    }

    localPayment = await TerminalPayment.create({
      operatorId: viewer._id,
      purpose,
      memberId,
      chargeId,
      donationId: localDonation?._id ?? null,
      principalCents,
      feeCents: 0,
      totalCents: principalCents,
      currency: "usd",
      description,
      payerName,
      payerEmail,
      note,
      locationId: terminalLocationId(),
      status: "creating",
    });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount: principalCents,
        currency: "usd",
        // Terminal payments are card-present by definition. Automatic capture
        // so there is never a two-day authorization for an officer to forget.
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        description:
          description ||
          (purpose === "donation"
            ? "Theta Tau donation"
            : "Theta Tau in-person payment"),
        receipt_email: receiptEmail || undefined,
        metadata: {
          // The webhook branches on this. Every intent this app creates carries
          // one so a lookup never has to guess which collection owns the row.
          kind: purpose === "donation" ? "terminal_donation" : "terminal",
          terminalPaymentId: String(localPayment._id),
          donationId: localDonation ? String(localDonation._id) : "",
          operatorId: String(viewer._id),
          memberId: memberId ? String(memberId) : "",
          chargeId: chargeId ? String(chargeId) : "",
          purpose,
        },
      },
      { idempotencyKey: `terminal-payment-${localPayment._id}` }
    );

    localPayment.stripePaymentIntentId = intent.id;
    localPayment.status = intent.status;
    await localPayment.save();
    if (localDonation) {
      localDonation.stripePaymentIntentId = intent.id;
      localDonation.status = intent.status;
      await localDonation.save();
    }

    return NextResponse.json(
      {
        payment: serializeTerminalPayment(localPayment),
        clientSecret: intent.client_secret,
        locationId: terminalLocationId(),
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (localPayment?._id && !localPayment?.stripePaymentIntentId) {
      await TerminalPayment.findByIdAndUpdate(localPayment._id, {
        status: "failed",
        failureMessage: "Stripe could not start this payment",
      }).catch(() => null);
    }
    if (localDonation?._id && !localDonation?.stripePaymentIntentId) {
      await Donation.findByIdAndDelete(localDonation._id).catch(() => null);
    }
    logger.error({ err }, "Failed to create a terminal PaymentIntent");
    return NextResponse.json(
      { error: "Couldn't start the payment" },
      { status: 500 }
    );
  }
}
