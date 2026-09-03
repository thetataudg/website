// lib/terminalPayments.ts
// In-person card payments taken with Tap to Pay on an officer's iPhone.
//
// The difference from the online path is not the money, it is the ownership.
// A member paying their own dues online is, by construction, paying their own
// dues. An officer holding a phone at a chapter event may be taking money from
// somebody who is not on the roster, for something that does not exist as a
// charge yet, or for a reason nobody will write down until Tuesday. So this
// module has one thing the online path never needed: a payment that has settled
// at Stripe and belongs to nobody yet.
import type Stripe from "stripe";
import Donation from "@/lib/models/Donation";
import TerminalPayment from "@/lib/models/TerminalPayment";
import { balanceCentsFor } from "@/lib/models/DuesCharge";
import DuesCharge from "@/lib/models/DuesCharge";
import {
  postCardPayment,
  reconcileCardReversal,
  unpostCardPayment,
} from "@/lib/cardPayments";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import { memberRecipient } from "@/lib/notify/audience";
import { notify } from "@/lib/notify";
import { sendDonationThankYou } from "@/lib/donationReceipt";
import logger from "@/lib/logger";

export function serializeTerminalPayment(row: any) {
  const memberId = row?.memberId ? String(row.memberId) : null;
  return {
    _id: row?._id?.toString?.() ?? "",
    purpose: row?.purpose ?? "general",
    memberId,
    chargeId: row?.chargeId ? String(row.chargeId) : null,
    donationId: row?.donationId ? String(row.donationId) : null,
    operatorId: row?.operatorId ? String(row.operatorId) : null,
    principalCents: Number(row?.principalCents) || 0,
    feeCents: Number(row?.feeCents) || 0,
    totalCents: Number(row?.totalCents) || 0,
    currency: String(row?.currency || "usd").toUpperCase(),
    description: row?.description ?? "",
    payerName: row?.payerName ?? "",
    payerEmail: row?.payerEmail ?? "",
    note: row?.note ?? "",
    status: row?.status ?? "creating",
    failureMessage: row?.failureMessage ?? "",
    declineCode: row?.declineCode ?? "",
    cardBrand: row?.cardBrand ?? "",
    last4: row?.last4 ?? "",
    walletType: row?.walletType ?? "",
    paidAt: row?.paidAt ? new Date(row.paidAt).toISOString() : null,
    confirmedAt: row?.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
    postedAt: row?.ledgerPostedAt ? new Date(row.ledgerPostedAt).toISOString() : null,
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    refundedCents: Number(row?.refundedCents) || 0,
    /// Settled money that no member owns yet. This is what the officer's
    /// unassigned queue counts.
    isUnassigned: isUnassignedTerminalPayment(row),
    assignedAt: row?.assignment?.assignedAt
      ? new Date(row.assignment.assignedAt).toISOString()
      : null,
    wasReassigned: (row?.assignment?.previousMemberIds ?? []).length > 0,
  };
}

/// Money that has actually settled and still belongs to nobody.
///
/// Keyed on a settled status rather than on `paidAt` alone, so an abandoned
/// intent that never got tapped does not sit in the officer's queue forever
/// pretending to be a decision somebody has to make.
export function isUnassignedTerminalPayment(row: any): boolean {
  if (!row) return false;
  if (row.memberId) return false;
  if (row.purpose === "donation") return false;
  return ["succeeded", "partially_refunded"].includes(String(row.status || ""));
}

/// Reads what the card actually was, defensively.
///
/// Stripe's typings do not cover every `card_present` field across API
/// versions, and none of this is worth failing a settled payment over, so every
/// read here is optional and every failure is an empty string.
export function readCardPresentDetails(intent: Stripe.PaymentIntent) {
  const charge: any =
    typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const present: any = charge?.payment_method_details?.card_present ?? null;
  return {
    stripeChargeId: charge?.id ?? null,
    cardBrand: String(present?.brand ?? ""),
    last4: String(present?.last4 ?? ""),
    walletType: String(present?.wallet?.type ?? ""),
  };
}

/// Post a settled in-person payment to wherever it belongs.
///
/// Idempotent in every branch, because Stripe retries webhooks and the phone
/// also calls the sync route the moment it finishes confirming. Both paths land
/// here and they race by design.
export async function fulfillTerminalPayment(intent: Stripe.PaymentIntent) {
  const row = await TerminalPayment.findOne({ stripePaymentIntentId: intent.id });
  if (!row) {
    logger.error(
      { paymentIntentId: intent.id },
      "Stripe terminal payment has no local record"
    );
    return;
  }

  const details = readCardPresentDetails(intent);
  row.status = "succeeded";
  row.failureMessage = "";
  row.declineCode = "";
  row.paidAt =
    row.paidAt ??
    new Date((intent.created || Math.floor(Date.now() / 1000)) * 1000);
  if (details.stripeChargeId) row.stripeChargeId = details.stripeChargeId;
  if (details.cardBrand) row.cardBrand = details.cardBrand;
  if (details.last4) row.last4 = details.last4;
  if (details.walletType) row.walletType = details.walletType;
  await row.save();

  if (row.purpose === "donation") {
    await settleDonationForTerminalPayment(row, intent);
    return;
  }

  // Unassigned money settles at Stripe and stops there. It reaches a ledger
  // when a human decides whose it is, and not before.
  if (!row.memberId) return;

  await postTerminalPaymentToLedger(row, { actorId: null, isAssignment: false });
}

/// The shared tail of "this payment now belongs to a member": allocate it,
/// stamp it, say so in their history, and tell them.
async function postTerminalPaymentToLedger(
  row: any,
  options: { actorId: any | null; isAssignment: boolean }
) {
  const posted = await postCardPayment({
    memberId: row.memberId,
    sourceId: row._id,
    principalCents: row.principalCents,
    method: "card",
    reference: row.stripePaymentIntentId
      ? `Tap to Pay ${row.stripePaymentIntentId}${row.description ? ` · ${row.description}` : ""}`
      : `Tap to Pay${row.description ? ` · ${row.description}` : ""}`,
    paidOn: row.paidAt ?? new Date(),
    preferredChargeIds: row.chargeId ? [row.chargeId] : [],
    creditRef: "terminalPaymentId",
    creditNote: `Excess from an in-person card payment${row.description ? `: ${row.description}` : ""}`,
  });

  row.allocations = posted.allocations;
  const firstPost = !row.ledgerPostedAt;
  row.ledgerPostedAt = row.ledgerPostedAt ?? new Date();
  await row.save();

  if (!firstPost) return posted;

  const creditTail =
    posted.creditCents > 0
      ? `; ${formatCents(posted.creditCents)} held as credit`
      : "";
  const summary = options.isAssignment
    ? `${formatCents(row.principalCents)} taken in person on ${cardLabel(row)} was assigned to this account${creditTail}.`
    : `${formatCents(row.principalCents)} paid in person by ${cardLabel(row)}${creditTail}.`;

  await recordFinanceEvent({
    memberId: row.memberId,
    actorId: options.actorId,
    type: options.isAssignment ? "payment_assigned" : "payment_terminal_succeeded",
    amountCents: row.principalCents,
    occurredAt: row.paidAt ?? new Date(),
    summary,
    refs: { terminalPaymentId: row._id, chargeId: row.chargeId ?? null },
    meta: {
      stripePaymentIntentId: row.stripePaymentIntentId,
      description: row.description || "",
      cardBrand: row.cardBrand || "",
      last4: row.last4 || "",
      walletType: row.walletType || "",
      locationId: row.locationId || "",
    },
  });

  if (!row.notifiedAt) {
    await announce({
      event: options.isAssignment ? "payment_assigned" : "payment_terminal_succeeded",
      memberId: row.memberId,
      actorId: options.actorId,
      amountCents: row.principalCents,
      summary,
      refs: { chargeId: row.chargeId ?? undefined },
      member: {
        template: "payment_verified",
        context: {
          amountCents: row.principalCents,
          method: "card in person",
          reason: "Your dues balance was updated automatically.",
        },
      },
    });
    row.notifiedAt = new Date();
    await row.save();
  }

  return posted;
}

function cardLabel(row: any): string {
  const brand = String(row?.cardBrand || "").trim();
  const last4 = String(row?.last4 || "").trim();
  if (brand && last4) return `${brand} ending ${last4}`;
  if (last4) return `card ending ${last4}`;
  return "card";
}

/// Give a settled payment an owner, or move it to a different one.
///
/// Nothing here touches Stripe. The money moved when the card was tapped; this
/// is bookkeeping, and it is reversible precisely because it is bookkeeping.
export async function assignTerminalPayment(input: {
  row: any;
  memberId: any;
  chargeId?: any | null;
  actorId: any;
  allowReassign?: boolean;
}): Promise<{ reassignedFrom: string | null }> {
  const { row } = input;

  if (["refunded", "partially_refunded", "disputed"].includes(String(row.status))) {
    const err: any = new Error(
      "This payment has been refunded or disputed, so it can't be assigned to a member"
    );
    err.statusCode = 409;
    throw err;
  }
  if (row.status !== "succeeded") {
    const err: any = new Error("Only a settled payment can be assigned");
    err.statusCode = 409;
    throw err;
  }
  if (row.purpose === "donation") {
    const err: any = new Error("A donation isn't assigned to a member's ledger");
    err.statusCode = 409;
    throw err;
  }

  const previous = row.memberId ? String(row.memberId) : null;
  const next = String(input.memberId);

  if (previous === next) {
    // Already where it belongs. Let the charge preference change, but do not
    // rewrite a ledger that is already correct.
    return { reassignedFrom: null };
  }

  if (previous && !input.allowReassign) {
    const err: any = new Error(
      "This payment is already assigned. Re-send with reassign: true to move it."
    );
    err.statusCode = 409;
    throw err;
  }

  if (previous) {
    const { removedCents } = await unpostCardPayment({
      memberId: row.memberId,
      sourceId: row._id,
      creditRef: "terminalPaymentId",
    });
    await recordFinanceEvent({
      memberId: row.memberId,
      actorId: input.actorId,
      type: "payment_unassigned",
      amountCents: -removedCents,
      summary: `${formatCents(removedCents)} taken in person was moved off this account.`,
      refs: { terminalPaymentId: row._id },
      meta: { stripePaymentIntentId: row.stripePaymentIntentId, movedTo: next },
    });
    row.assignment = row.assignment ?? {};
    row.assignment.previousMemberIds = [
      ...(row.assignment.previousMemberIds ?? []),
      row.memberId,
    ];
    row.allocations = [];
    row.ledgerPostedAt = null;
    row.notifiedAt = null;
  }

  row.memberId = input.memberId;
  row.chargeId = input.chargeId ?? null;
  row.purpose = input.chargeId ? "charge" : "member";
  row.assignment = row.assignment ?? {};
  row.assignment.assignedBy = input.actorId;
  row.assignment.assignedAt = new Date();
  await row.save();

  await postTerminalPaymentToLedger(row, {
    actorId: input.actorId,
    isAssignment: true,
  });

  return { reassignedFrom: previous };
}

/// Take a payment back off a member's ledger and return it to the general pool.
export async function unassignTerminalPayment(input: {
  row: any;
  actorId: any;
}): Promise<{ removedCents: number }> {
  const { row } = input;
  if (!row.memberId) return { removedCents: 0 };
  if (["refunded", "partially_refunded", "disputed"].includes(String(row.status))) {
    const err: any = new Error(
      "This payment has been refunded or disputed, so its ledger rows can't be moved"
    );
    err.statusCode = 409;
    throw err;
  }

  const { removedCents } = await unpostCardPayment({
    memberId: row.memberId,
    sourceId: row._id,
    creditRef: "terminalPaymentId",
  });
  await recordFinanceEvent({
    memberId: row.memberId,
    actorId: input.actorId,
    type: "payment_unassigned",
    amountCents: -removedCents,
    summary: `${formatCents(removedCents)} taken in person was moved off this account.`,
    refs: { terminalPaymentId: row._id },
    meta: { stripePaymentIntentId: row.stripePaymentIntentId },
  });

  row.assignment = row.assignment ?? {};
  row.assignment.previousMemberIds = [
    ...(row.assignment.previousMemberIds ?? []),
    row.memberId,
  ];
  row.assignment.assignedBy = input.actorId;
  row.assignment.assignedAt = null;
  row.memberId = null;
  row.chargeId = null;
  row.purpose = "general";
  row.allocations = [];
  row.ledgerPostedAt = null;
  row.notifiedAt = null;
  await row.save();

  return { removedCents };
}

/// Bring the ledger back in line with Stripe after a refund or a dispute.
export async function reconcileTerminalReversal(input: {
  paymentIntentId: string;
  refundedCents: number;
  disputed: boolean;
  disputeId?: string | null;
  disputeStatus?: string | null;
}) {
  const row = await TerminalPayment.findOne({
    stripePaymentIntentId: input.paymentIntentId,
  });
  if (!row) return;

  const result = await reconcileCardReversal({
    row,
    creditRef: "terminalPaymentId",
    refundedCents: input.refundedCents,
    disputed: input.disputed,
    disputeId: input.disputeId,
    disputeStatus: input.disputeStatus,
  });

  if (row.donationId) {
    await Donation.findByIdAndUpdate(row.donationId, {
      status: row.status,
      refundedCents: row.refundedCents,
      disputeId: row.disputeId,
      disputeStatus: row.disputeStatus,
    }).catch(() => null);
  }

  if (!result.changed || !row.memberId) return;

  await recordFinanceEvent({
    memberId: row.memberId,
    actorId: null,
    type: input.disputed ? "payment_terminal_disputed" : "payment_terminal_refunded",
    amountCents: -result.reversedCents,
    summary: input.disputed
      ? `${formatCents(row.principalCents)} in-person payment disputed; the balance was reopened.`
      : `${formatCents(result.reversedCents)} of an in-person payment refunded.`,
    refs: { terminalPaymentId: row._id },
    meta: {
      stripePaymentIntentId: input.paymentIntentId,
      disputeId: input.disputeId ?? null,
      disputeStatus: input.disputeStatus ?? null,
    },
  });
}

/// An in-person gift: mark the donation settled and leave every ledger alone.
async function settleDonationForTerminalPayment(
  row: any,
  intent: Stripe.PaymentIntent
) {
  if (!row.donationId) return;
  const donation = await Donation.findById(row.donationId);
  if (!donation) return;
  if (donation.status === "succeeded") return;

  donation.status = "succeeded";
  donation.failureMessage = "";
  donation.paidAt = row.paidAt ?? new Date();
  donation.stripeChargeId = row.stripeChargeId ?? null;
  await donation.save();

  if (donation.donorMemberId) {
    await recordFinanceEvent({
      memberId: donation.donorMemberId,
      actorId: row.operatorId ?? null,
      type: "donation_received",
      amountCents: donation.amountCents,
      occurredAt: donation.paidAt,
      // A gift is not a payment against anything. Saying so in the history line
      // is what stops it reading like a dues credit six months from now.
      summary: `${formatCents(donation.amountCents)} donated to the chapter. This is a gift and does not change any balance.`,
      refs: { donationId: donation._id, terminalPaymentId: row._id },
      meta: { designation: donation.designation, channel: "terminal" },
    });
  }

  logger.info(
    { donationId: String(donation._id), paymentIntentId: intent.id },
    "In-person donation settled"
  );

  await sendDonationThankYou(donation);
}

/// The ceiling on an ad-hoc in-person charge against a member.
///
/// Unlike the online path there is no ceiling in the general case: an officer
/// taking money at an event may legitimately be collecting for something that
/// is not a charge yet. This exists only so the "pay this charge" button cannot
/// quietly take more than the charge is worth.
export async function chargeBalanceCeiling(chargeId: any): Promise<number> {
  const charge = await DuesCharge.findById(chargeId).lean<any>();
  if (!charge) return 0;
  return balanceCentsFor(charge);
}

/// Tell the officer who took it that a card was declined.
///
/// Requirement 5.12: the officer may well have put the phone away before the
/// result came back, so the outcome has to find them rather than wait on a
/// screen nobody is looking at. Sent to the operator, not the payer: the payer
/// is standing there and already saw Apple's own decline screen.
///
/// Idempotent on `failureNotifiedAt`, because Stripe redelivers webhooks and a
/// second push saying the same card failed again would read as a second
/// decline.
export async function notifyTerminalFailure(intentId: string): Promise<void> {
  try {
    const row = await TerminalPayment.findOne({ stripePaymentIntentId: intentId });
    if (!row || row.failureNotifiedAt || !row.operatorId) return;

    const operator = await memberRecipient(row.operatorId);
    if (!operator) return;

    await notify({
      recipient: operator,
      template: "terminal_payment_failed",
      context: {
        firstName: operator.firstName,
        amountCents: Number(row.principalCents) || 0,
        description: String(row.failureMessage || ""),
      } as any,
      amountCents: Number(row.principalCents) || 0,
    });

    row.failureNotifiedAt = new Date();
    await row.save();
  } catch (err) {
    // Never the reason a webhook 500s and Stripe retries: the payment status
    // is already recorded, and a missing push is not worth replaying the event.
    logger.error({ err, intentId }, "Could not tell the operator a card was declined");
  }
}
