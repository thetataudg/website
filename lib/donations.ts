// lib/donations.ts
// Gifts to the chapter, from anybody, through any door.
//
// The rule this module exists to enforce is a single sentence: a donation never
// touches the dues ledger. Not as a payment, not as credit, not for a donor who
// happens to owe money. Everything else here is bookkeeping around that.
import type Stripe from "stripe";
import Donation, {
  DONATION_DESIGNATIONS,
  DONATION_DESIGNATION_LABELS,
} from "@/lib/models/Donation";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { sendDonationThankYou } from "@/lib/donationReceipt";
import logger from "@/lib/logger";

/// The floor keeps the public endpoint from being used as a card tester, where
/// the whole point is to run a great many tiny authorizations. The ceiling is
/// not about generosity; a gift larger than this from a stranger on an
/// unauthenticated page is worth a conversation before it is worth a receipt.
export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 1_000_000;

export function isDonationDesignation(value: any): boolean {
  return (DONATION_DESIGNATIONS as readonly string[]).includes(String(value));
}

/// The funds a client should offer, in the order they should appear. Served to
/// the app so the phone, the website and the server can never disagree about
/// what a donor may choose.
export function donationDesignationOptions() {
  return (DONATION_DESIGNATIONS as readonly string[]).map((value) => ({
    value,
    label: DONATION_DESIGNATION_LABELS[value] ?? value,
  }));
}

export function donationDesignationLabel(value: any): string {
  return DONATION_DESIGNATION_LABELS[String(value)] ?? "Where it's needed most";
}

export function serializeDonation(row: any, options?: { forPublic?: boolean }) {
  const anonymous = Boolean(row?.isAnonymous);
  const hide = Boolean(options?.forPublic) && anonymous;
  return {
    _id: row?._id?.toString?.() ?? "",
    amountCents: Number(row?.amountCents) || 0,
    currency: String(row?.currency || "usd").toUpperCase(),
    designation: row?.designation ?? "general",
    designationLabel: donationDesignationLabel(row?.designation),
    message: row?.message ?? "",
    isAnonymous: anonymous,
    channel: row?.channel ?? "web",
    donorName: hide ? "" : (row?.donorName ?? ""),
    donorEmail: hide ? "" : (row?.donorEmail ?? ""),
    donorMemberId: row?.donorMemberId ? String(row.donorMemberId) : null,
    status: row?.status ?? "creating",
    paidAt: row?.paidAt ? new Date(row.paidAt).toISOString() : null,
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    refundedCents: Number(row?.refundedCents) || 0,
    acknowledgedAt: row?.acknowledgedAt
      ? new Date(row.acknowledgedAt).toISOString()
      : null,
    /// Whether the automatic thank-you actually reached them. Separate from
    /// `acknowledgedAt`, which is a person saying they handled it.
    receiptSentAt: row?.receiptSentAt
      ? new Date(row.receiptSentAt).toISOString()
      : null,
    canEmail: Boolean(String(row?.donorEmail || "").trim()),
  };
}

/// How the donor is named in a thank-you, a report, or a history line.
export function donorLabel(row: any): string {
  if (row?.isAnonymous) return "An anonymous donor";
  const name = String(row?.donorName || "").trim();
  return name || "A donor";
}

/// Mark a settled donation as settled. Idempotent: both the webhook and the
/// client-side sync call land here and either may arrive first.
export async function fulfillDonation(intent: Stripe.PaymentIntent) {
  const row = await Donation.findOne({ stripePaymentIntentId: intent.id });
  if (!row) {
    logger.error(
      { paymentIntentId: intent.id },
      "Stripe donation has no local record"
    );
    return;
  }
  if (row.status === "succeeded") return;

  const charge: any =
    typeof intent.latest_charge === "object" ? intent.latest_charge : null;

  row.status = "succeeded";
  row.failureMessage = "";
  row.paidAt =
    row.paidAt ??
    new Date((intent.created || Math.floor(Date.now() / 1000)) * 1000);
  if (charge?.id) row.stripeChargeId = charge.id;
  else if (typeof intent.latest_charge === "string") {
    row.stripeChargeId = intent.latest_charge;
  }
  await row.save();

  // A member's own history should show that they gave, but it must never read
  // as money against a balance. The sentence says so out loud for exactly that
  // reason: this line will be read again long after anybody remembers the
  // difference.
  if (row.donorMemberId) {
    await recordFinanceEvent({
      memberId: row.donorMemberId,
      actorId: null,
      type: "donation_received",
      amountCents: row.amountCents,
      occurredAt: row.paidAt,
      summary: `${formatCents(row.amountCents)} donated to the chapter. This is a gift and does not change any balance.`,
      refs: { donationId: row._id },
      meta: {
        designation: row.designation,
        channel: row.channel,
        stripePaymentIntentId: intent.id,
      },
    });
  }

  logger.info(
    {
      donationId: String(row._id),
      amountCents: row.amountCents,
      designation: row.designation,
      channel: row.channel,
    },
    "Donation settled"
  );

  // Best effort, and after the money is recorded. A gift that settled but could
  // not be thanked is a follow-up for a human, never a reason to fail the
  // webhook that recorded it.
  await sendDonationThankYou(row);
}

/// Refunds and disputes on a gift. There is no ledger to unwind, so this is
/// only ever a status change plus a history line for a member donor.
export async function reconcileDonationReversal(input: {
  paymentIntentId: string;
  refundedCents: number;
  disputed: boolean;
  disputeId?: string | null;
  disputeStatus?: string | null;
}) {
  const row = await Donation.findOne({
    stripePaymentIntentId: input.paymentIntentId,
  });
  if (!row) return;

  const previousStatus = row.status;
  const previousRefunded = Number(row.refundedCents) || 0;
  const refunded = Math.min(row.amountCents, Math.max(0, input.refundedCents));

  row.refundedCents = refunded;
  row.disputeId = input.disputeId ?? row.disputeId;
  row.disputeStatus = input.disputeStatus ?? row.disputeStatus;
  row.status = input.disputed
    ? "disputed"
    : refunded >= row.amountCents
      ? "refunded"
      : refunded > 0
        ? "partially_refunded"
        : "succeeded";
  await row.save();

  const changed =
    previousStatus !== row.status || previousRefunded !== refunded;
  if (!changed || !row.donorMemberId) return;

  await recordFinanceEvent({
    memberId: row.donorMemberId,
    actorId: null,
    type: "donation_refunded",
    amountCents: -(input.disputed ? row.amountCents : refunded),
    summary: input.disputed
      ? `${formatCents(row.amountCents)} donation disputed.`
      : `${formatCents(refunded)} of a donation refunded.`,
    refs: { donationId: row._id },
    meta: {
      stripePaymentIntentId: input.paymentIntentId,
      disputeId: input.disputeId ?? null,
      disputeStatus: input.disputeStatus ?? null,
    },
  });
}

/// Totals for the treasury view, by designation and in aggregate.
export async function donationTotals(match: Record<string, any> = {}) {
  const rows = await Donation.aggregate([
    { $match: { status: { $in: ["succeeded", "partially_refunded"] }, ...match } },
    {
      $group: {
        _id: "$designation",
        grossCents: { $sum: "$amountCents" },
        refundedCents: { $sum: "$refundedCents" },
        count: { $sum: 1 },
      },
    },
  ]);
  const byDesignation = rows.map((row: any) => ({
    designation: row._id ?? "general",
    label: donationDesignationLabel(row._id),
    grossCents: row.grossCents ?? 0,
    refundedCents: row.refundedCents ?? 0,
    netCents: Math.max(0, (row.grossCents ?? 0) - (row.refundedCents ?? 0)),
    count: row.count ?? 0,
  }));
  return {
    currency: "USD",
    byDesignation,
    grossCents: byDesignation.reduce((sum, row) => sum + row.grossCents, 0),
    refundedCents: byDesignation.reduce((sum, row) => sum + row.refundedCents, 0),
    netCents: byDesignation.reduce((sum, row) => sum + row.netCents, 0),
    count: byDesignation.reduce((sum, row) => sum + row.count, 0),
  };
}
