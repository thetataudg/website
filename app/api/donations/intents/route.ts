// app/api/donations/intents/route.ts
// Start a gift to the chapter. Reachable without signing in, because most of
// the people this is for are alumni who no longer have an account.
import { NextResponse } from "next/server";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Donation from "@/lib/models/Donation";
import { requireAuth } from "@/lib/clerk";
import { readAmountCents } from "@/lib/dues";
import { formatCents } from "@/lib/financeEvents";
import {
  isDonationDesignation,
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
  serializeDonation,
} from "@/lib/donations";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { donationsEnabled, getStripe, stripePublishableKey } from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!donationsEnabled()) {
    return NextResponse.json(
      { error: "Online giving isn't switched on yet" },
      { status: 503 }
    );
  }

  const limit = rateLimit(`donation:${clientKey(req)}`, 8, 300);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of attempts in a short time. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let donation: any = null;
  try {
    await connectDB();
    const body = await req.json();

    const amountCents = readAmountCents(body);
    if (
      amountCents === null ||
      amountCents < MIN_DONATION_CENTS ||
      amountCents > MAX_DONATION_CENTS
    ) {
      return NextResponse.json(
        {
          error: `Please choose an amount between ${formatCents(MIN_DONATION_CENTS)} and ${formatCents(MAX_DONATION_CENTS)}.`,
        },
        { status: 400 }
      );
    }

    const designation = String(body?.designation ?? "general");
    if (!isDonationDesignation(designation)) {
      return NextResponse.json(
        { error: "Please choose one of the listed funds." },
        { status: 400 }
      );
    }

    const donorName = String(body?.donorName ?? "").trim().slice(0, 120);
    const donorEmail = String(body?.donorEmail ?? "").trim().slice(0, 200);
    const message = String(body?.message ?? "").trim().slice(0, 500);
    const isAnonymous = Boolean(body?.isAnonymous);

    if (donorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) {
      return NextResponse.json(
        { error: "That email address doesn't look right." },
        { status: 400 }
      );
    }

    // Signing in is optional. When somebody is signed in we link the gift to
    // their profile so their own history shows it, but a signed-out alumnus is
    // the expected case and must not be made to create an account to give.
    let donorMemberId: any = null;
    try {
      const clerkId = await requireAuth(req as any);
      const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
      donorMemberId = member?._id ?? null;
    } catch {
      donorMemberId = null;
    }

    donation = await Donation.create({
      donorMemberId,
      donorName,
      donorEmail,
      amountCents,
      designation,
      message,
      isAnonymous,
      channel: body?.channel === "app" ? "app" : "web",
      status: "creating",
    });

    const intent = await getStripe().paymentIntents.create(
      {
        // The server sets the amount from a validated body. A total that came
        // from the client is not a total.
        amount: amountCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        description: "Donation to Theta Tau Delta Gamma",
        receipt_email: donorEmail || undefined,
        metadata: {
          kind: "donation",
          donationId: String(donation._id),
          designation,
          isAnonymous: String(isAnonymous),
          donorMemberId: donorMemberId ? String(donorMemberId) : "",
        },
      },
      { idempotencyKey: `donation-${donation._id}` }
    );

    donation.stripePaymentIntentId = intent.id;
    donation.status = intent.status;
    await donation.save();

    return NextResponse.json(
      {
        donation: serializeDonation(donation, { forPublic: true }),
        clientSecret: intent.client_secret,
        publishableKey: stripePublishableKey(),
        merchantIdentifier:
          process.env.STRIPE_APPLE_MERCHANT_ID ?? "merchant.org.thetatau.dg.ThetaTau",
        merchantCountryCode: "US",
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (donation?._id && !donation?.stripePaymentIntentId) {
      await Donation.findByIdAndDelete(donation._id).catch(() => null);
    }
    logger.error({ err }, "Failed to create a donation PaymentIntent");
    return NextResponse.json(
      { error: "Something went wrong starting that donation. Please try again." },
      { status: 500 }
    );
  }
}
