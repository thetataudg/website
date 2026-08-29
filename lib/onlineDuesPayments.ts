import type Stripe from "stripe";
import CreditEntry from "@/lib/models/CreditEntry";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import logger from "@/lib/logger";
import { getStripe } from "@/lib/stripe";

export type OnlinePaymentKind = "installment" | "custom" | "full";

export function serializeOnlinePayment(row: any) {
  return {
    _id: row?._id?.toString?.() ?? "",
    requestedKind: row?.requestedKind ?? "custom",
    principalCents: Number(row?.principalCents) || 0,
    feeCents: Number(row?.feeCents) || 0,
    totalCents: Number(row?.totalCents) || 0,
    currency: String(row?.currency || "usd").toUpperCase(),
    paymentMethod: row?.paymentMethod ?? "unknown",
    status: row?.status ?? "creating",
    failureMessage: row?.failureMessage ?? "",
    note: row?.note ?? "",
    paidAt: row?.paidAt ? new Date(row.paidAt).toISOString() : null,
    confirmedAt: row?.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
    postedAt: row?.ledgerPostedAt ? new Date(row.ledgerPostedAt).toISOString() : null,
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    refundedCents: Number(row?.refundedCents) || 0,
    /// True while the member has authorized money that has not yet reduced
    /// their balance. Clients show this as "pending" and must not subtract it.
    pending: isOnlinePaymentPending(row),
  };
}

/// Money the member has committed that the chapter cannot yet count.
///
/// The gap this closes is small in wall-clock time and large in trust: between
/// the member tapping Pay and the webhook posting the ledger row, the old
/// summary showed neither a reduced balance nor any sign the payment existed,
/// so a member who had just paid saw a screen that said they had not. It is
/// deliberately keyed on `ledgerPostedAt` rather than on status alone, because
/// the honest question is "has this money reached the ledger yet", and a card
/// can read `succeeded` at Stripe for several seconds before it has.
export function isOnlinePaymentPending(row: any): boolean {
  if (!row) return false;
  if (row.ledgerPostedAt) return false;
  const status = String(row.status || "");
  if (status === "failed" || status === "canceled") return false;
  if (status === "processing" || status === "succeeded") return true;
  // Confirmed in the Stripe sheet, but no webhook or sync has answered yet.
  return Boolean(row.confirmedAt);
}

export function pendingOnlinePrincipalCents(rows: any[]): number {
  return rows
    .filter(isOnlinePaymentPending)
    .reduce((sum, row) => sum + Math.max(0, Number(row?.principalCents) || 0), 0);
}

/// What a member is allowed to submit.
///
/// **The ceiling is what they owe, not what they owe minus money in flight.**
///
/// This used to reserve every processing payment out of the payable balance,
/// on the reasoning that money already committed should not be committed
/// twice. That is a sound instinct and it was the wrong trade. A payment only
/// stops being "processing" when a webhook posts it to the ledger, and a
/// webhook that never arrives — a tunnel that was closed, a failed delivery,
/// a test intent nobody completed — reserved the balance permanently. A member
/// owing $20 with a stale $200 intent against their name could not pay the $20
/// at all, and nothing on the screen explained why: the Pay button simply was
/// not there.
///
/// Removing the reservation cannot lose anybody money. `applyOnlinePayment`
/// allocates against open charges and turns anything left over into a
/// `CreditEntry`, which auto-applies to the next charge. So the worst case for
/// a member who pays twice is that they hold a credit, not that they are out
/// of pocket. Weighed against being locked out of paying at all, that is the
/// better failure.
///
/// What is still enforced is the ceiling: pay $400 against a $200 balance and
/// the route refuses and says the balance is $200. Partial payments are the
/// point — pay $200 of $400, then $150, then $50, until it is gone.
///
/// `processingCents` is still returned so the screen can say what is in
/// flight. Telling somebody a payment is on its way is the right way to stop a
/// double payment; taking the button away is not.
export function onlinePaymentAvailability(
  balanceCents: number,
  amountDueNowCents: number,
  processingCents: number
) {
  const pending = Math.max(0, processingCents);
  const balance = Math.max(0, balanceCents);
  const dueNow = Math.min(balance, Math.max(0, amountDueNowCents));
  return {
    payableBalanceCents: balance,
    payableDueNowCents: dueNow,
    processingCents: pending,
  };
}

export function initialAllocations(charges: any[], principalCents: number) {
  let remaining = principalCents;
  const ordered = [...charges].sort((a, b) => {
    const aDue = a?.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b?.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a?.createdAt ?? 0).getTime() - new Date(b?.createdAt ?? 0).getTime();
  });
  const result: Array<{ chargeId: any; amountCents: number; reversedCents: number }> = [];
  for (const charge of ordered) {
    if (remaining <= 0) break;
    const amountCents = Math.min(remaining, balanceCentsFor(charge));
    if (amountCents <= 0) continue;
    result.push({ chargeId: charge._id, amountCents, reversedCents: 0 });
    remaining -= amountCents;
  }
  return result;
}

async function detectMethod(intent: Stripe.PaymentIntent) {
  let paymentMethod = intent.payment_method;
  if (typeof paymentMethod === "string") {
    paymentMethod = await getStripe().paymentMethods.retrieve(paymentMethod);
  }
  if (paymentMethod && typeof paymentMethod === "object") {
    if (paymentMethod.type === "us_bank_account") return "us_bank_account";
    if (paymentMethod.type === "card") {
      const wallet = paymentMethod.card?.wallet?.type;
      return wallet === "apple_pay" ? "apple_pay" : "card";
    }
  }
  if (intent.payment_method_types.includes("us_bank_account") &&
      !intent.payment_method_types.includes("card")) return "us_bank_account";
  return "card";
}

/// Idempotently posts a succeeded PaymentIntent to the dues ledger. Because the
/// database is standalone, each charge write guards on `sourceRef`; a webhook
/// retry can finish a partial run without crediting any charge twice.
export async function fulfillOnlineDuesPayment(intent: Stripe.PaymentIntent) {
  const row = await OnlineDuesPayment.findOne({
    stripePaymentIntentId: intent.id,
  });
  if (!row) {
    logger.error({ paymentIntentId: intent.id }, "Stripe payment has no local dues record");
    return;
  }

  row.status = "succeeded";
  row.failureMessage = "";
  row.paidAt = new Date((intent.created || Math.floor(Date.now() / 1000)) * 1000);
  row.paymentMethod = await detectMethod(intent);
  if (typeof intent.latest_charge === "string") row.stripeChargeId = intent.latest_charge;
  else if (intent.latest_charge?.id) row.stripeChargeId = intent.latest_charge.id;
  await row.save();

  const alreadyPosted = await DuesCharge.find({
    memberId: row.memberId,
    "payments.sourceRef": row._id,
  });
  const alreadyCents = alreadyPosted.reduce((sum, charge) => {
    return sum + (charge.payments ?? [])
      .filter((payment: any) => String(payment.sourceRef) === String(row._id))
      .reduce((part: number, payment: any) => part + Number(payment.amountCents || 0), 0);
  }, 0);
  const existingCredit = await CreditEntry.findOne({
    "refs.onlinePaymentId": row._id,
  }).lean<any>();
  let remaining = Math.max(
    0,
    row.principalCents - alreadyCents - (Number(existingCredit?.amountCents) || 0)
  );

  const preferredIds = row.allocations.map((allocation: any) => String(allocation.chargeId));
  const charges = await DuesCharge.find({ memberId: row.memberId, status: "open" }).sort({
    dueDate: 1,
    createdAt: 1,
  });
  charges.sort((a: any, b: any) => {
    const ai = preferredIds.indexOf(String(a._id));
    const bi = preferredIds.indexOf(String(b._id));
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return 0;
  });

  const actualAllocations: any[] = [];
  for (const charge of charges) {
    const existing = (charge.payments ?? []).find(
      (payment: any) => String(payment.sourceRef) === String(row._id)
    );
    if (existing) {
      actualAllocations.push({
        chargeId: charge._id,
        amountCents: existing.amountCents,
        reversedCents: existing.reversedCents ?? 0,
        ledgerPaymentId: existing._id,
      });
      continue;
    }
    if (remaining <= 0) continue;
    const applied = Math.min(remaining, balanceCentsFor(charge));
    if (applied <= 0) continue;
    charge.payments.push({
      amountCents: applied,
      reversedCents: 0,
      method: row.paymentMethod === "us_bank_account" ? "ach" : "card",
      reference: row.note
        ? `Stripe ${intent.id} · ${row.note}`.slice(0, 300)
        : `Stripe ${intent.id}`,
      paidOn: row.paidAt,
      recordedAt: new Date(),
      recordedBy: null,
      sourceRef: row._id,
    });
    await charge.save();
    const created = charge.payments[charge.payments.length - 1];
    actualAllocations.push({
      chargeId: charge._id,
      amountCents: applied,
      reversedCents: 0,
      ledgerPaymentId: created?._id ?? null,
    });
    remaining -= applied;
  }

  // If the balance moved after checkout began, preserve every cent as member
  // credit instead of overpaying an already-settled charge.
  if (remaining > 0 && !existingCredit) {
    await CreditEntry.create({
      memberId: row.memberId,
      amountCents: remaining,
      type: "earned",
      occurredAt: row.paidAt,
      refs: { onlinePaymentId: row._id },
      actorId: null,
      note: `Excess from Stripe payment ${intent.id}`,
    });
  }

  row.allocations = actualAllocations;
  const firstPost = !row.ledgerPostedAt;
  row.ledgerPostedAt = row.ledgerPostedAt ?? new Date();
  await row.save();
  if (firstPost) {
    await recordFinanceEvent({
      memberId: row.memberId,
      actorId: null,
      type: "payment_online_succeeded",
      amountCents: row.principalCents,
      occurredAt: row.paidAt,
      summary: `${formatCents(row.principalCents)} paid online${remaining > 0 ? `; ${formatCents(remaining)} held as credit` : ""}.${row.note ? ` Member's note: ${row.note}` : ""}`,
      refs: { paymentId: row._id },
      meta: {
        paymentMethod: row.paymentMethod,
        stripePaymentIntentId: intent.id,
        feeCents: row.feeCents,
        note: row.note || "",
      },
    });
  }

  if (!row.notifiedAt) {
    await announce({
      event: "payment_verified",
      memberId: row.memberId,
      actorId: null,
      amountCents: row.principalCents,
      summary: `${formatCents(row.principalCents)} paid online`,
      refs: {},
      member: {
        template: "payment_verified",
        context: {
          amountCents: row.principalCents,
          method: row.paymentMethod === "us_bank_account" ? "bank account" : "Stripe",
          reason: "Your dues balance was updated automatically.",
        },
      },
    });
    row.notifiedAt = new Date();
    await row.save();
  }
}

/// Makes the ledger equal Stripe's current refunded/disputed principal while
/// retaining the original payment rows for the audit trail.
export async function reconcileOnlineDuesReversal(input: {
  paymentIntentId: string;
  refundedCents: number;
  disputed: boolean;
  disputeId?: string | null;
  disputeStatus?: string | null;
}) {
  const row = await OnlineDuesPayment.findOne({
    stripePaymentIntentId: input.paymentIntentId,
  });
  if (!row) return;
  const previousStatus = row.status;
  const previousAllocationReversed = (row.allocations ?? []).reduce(
    (sum: number, allocation: any) => sum + (Number(allocation.reversedCents) || 0),
    0
  );
  const desired = Math.min(
    row.principalCents,
    input.disputed ? row.principalCents : Math.max(0, input.refundedCents)
  );
  const allocatedPrincipal = (row.allocations ?? []).reduce(
    (sum: number, allocation: any) => sum + (Number(allocation.amountCents) || 0),
    0
  );
  const originalCredit = Math.max(0, row.principalCents - allocatedPrincipal);
  const previousDesired = Math.min(
    row.principalCents,
    previousStatus === "disputed"
      ? row.principalCents
      : Math.max(0, Number(row.refundedCents) || 0)
  );
  const previousReversed =
    previousAllocationReversed + Math.min(previousDesired, originalCredit);
  const creditReversed = Math.min(desired, originalCredit);
  if (originalCredit > 0) {
    await CreditEntry.findOneAndUpdate(
      { "refs.onlinePaymentId": row._id },
      { amountCents: originalCredit - creditReversed }
    );
  }
  let remaining = Math.max(0, desired - creditReversed);
  const charges = await DuesCharge.find({
    memberId: row.memberId,
    "payments.sourceRef": row._id,
  }).sort({ dueDate: -1, createdAt: -1 });
  for (const charge of charges) {
    let changed = false;
    for (const payment of [...charge.payments].reverse() as any[]) {
      if (String(payment.sourceRef) !== String(row._id)) continue;
      const reversed = Math.min(remaining, Number(payment.amountCents) || 0);
      if (Number(payment.reversedCents || 0) !== reversed) {
        payment.reversedCents = reversed;
        changed = true;
      }
      remaining -= reversed;
    }
    if (changed) await charge.save();
  }
  row.refundedCents = Math.max(0, input.refundedCents);
  row.disputeId = input.disputeId ?? row.disputeId;
  row.disputeStatus = input.disputeStatus ?? row.disputeStatus;
  row.status = input.disputed
    ? "disputed"
    : desired >= row.principalCents
      ? "refunded"
      : desired > 0
        ? "partially_refunded"
        : "succeeded";
  for (const allocation of row.allocations as any[]) {
    const charge = charges.find((item: any) => String(item._id) === String(allocation.chargeId));
    const ledger = charge?.payments?.find(
      (payment: any) => String(payment._id) === String(allocation.ledgerPaymentId)
    );
    allocation.reversedCents = Number(ledger?.reversedCents) || 0;
  }
  await row.save();

  const currentReversed = (row.allocations ?? []).reduce(
    (sum: number, allocation: any) => sum + (Number(allocation.reversedCents) || 0),
    0
  ) + creditReversed;
  if (previousStatus !== row.status || previousReversed !== currentReversed) {
    const type = input.disputed
      ? "payment_online_disputed"
      : "payment_online_refunded";
    await recordFinanceEvent({
      memberId: row.memberId,
      actorId: null,
      type,
      amountCents: -currentReversed,
      summary: input.disputed
        ? `${formatCents(row.principalCents)} online payment disputed; the balance was reopened.`
        : `${formatCents(currentReversed)} of an online payment refunded.`,
      refs: { paymentId: row._id },
      meta: {
        stripePaymentIntentId: input.paymentIntentId,
        disputeId: input.disputeId ?? null,
        disputeStatus: input.disputeStatus ?? null,
      },
    });
  }
}
