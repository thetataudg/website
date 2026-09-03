// lib/cardPayments.ts
// The one place a settled card payment becomes rows on a member's ledger.
//
// This started life inside `fulfillOnlineDuesPayment` and was lifted out when
// Tap to Pay arrived, because the two channels differ in everything *except*
// this: an authorized amount, a member, and the question of which charges it
// pays down. The two properties worth protecting are both here rather than in
// either caller:
//
//   1. Every charge write is guarded on `payments.sourceRef`, so a webhook that
//      retries — and Stripe retries every non-2xx — finishes a partial run
//      instead of crediting a charge twice. The database is a standalone mongod
//      with no multi-document transactions, so idempotency is the only tool
//      available and it has to be in the write itself.
//
//   2. Money that outruns the balance becomes a `CreditEntry` rather than an
//      overpayment. Balances moved between checkout and settlement more often
//      than anyone expected, and a member who overpays should hold credit, not
//      lose the difference.
import CreditEntry from "@/lib/models/CreditEntry";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";

/// Which `CreditEntry.refs` key owns the overflow. Each has a unique partial
/// index, which is what makes "create the credit" safe to run twice.
export type CardCreditRef = "onlinePaymentId" | "terminalPaymentId";

export interface PostCardPaymentInput {
  memberId: any;
  /// The payment row's `_id`. Written to every ledger row as `sourceRef`, and
  /// the thing every idempotency guard keys on.
  sourceId: any;
  principalCents: number;
  method: "card" | "ach";
  reference: string;
  /// When the money moved. Punctuality is judged on this and never on when the
  /// webhook happened to land.
  paidOn: Date;
  /// Charges the caller would rather settle first, in order. Anything not named
  /// still gets paid, just after these.
  preferredChargeIds?: any[];
  creditRef: CardCreditRef;
  creditNote: string;
}

export interface CardAllocation {
  chargeId: any;
  amountCents: number;
  reversedCents: number;
  ledgerPaymentId: any;
}

export interface PostCardPaymentResult {
  allocations: CardAllocation[];
  /// Everything this payment left as credit, whether written on this run or a
  /// previous one. Callers put it in the summary sentence.
  creditCents: number;
}

/// Idempotently turn one settled payment into ledger rows.
export async function postCardPayment(
  input: PostCardPaymentInput
): Promise<PostCardPaymentResult> {
  const { memberId, sourceId, principalCents, creditRef } = input;

  // What a previous run of this same payment already posted.
  const alreadyPosted = await DuesCharge.find({
    memberId,
    "payments.sourceRef": sourceId,
  });
  // The ids counted below. The allocation loop runs a later, separate query, so
  // it can see a payment this read missed — that is the shape of a concurrent
  // replay of the same Stripe event. Anything it finds that is not in this set
  // has not been subtracted yet, and must come off `remaining` there instead.
  const countedPaymentIds = new Set<string>();
  const alreadyCents = alreadyPosted.reduce((sum: number, charge: any) => {
    return (
      sum +
      (charge.payments ?? [])
        .filter((payment: any) => String(payment.sourceRef) === String(sourceId))
        .reduce((part: number, payment: any) => {
          countedPaymentIds.add(String(payment._id));
          return part + Number(payment.amountCents || 0);
        }, 0)
    );
  }, 0);

  const existingCredit = await CreditEntry.findOne({
    [`refs.${creditRef}`]: sourceId,
  }).lean<any>();
  const existingCreditCents = Number(existingCredit?.amountCents) || 0;

  let remaining = Math.max(
    0,
    principalCents - alreadyCents - existingCreditCents
  );

  const preferredIds = (input.preferredChargeIds ?? []).map((id) => String(id));
  const charges = await DuesCharge.find({ memberId, status: "open" }).sort({
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

  const allocations: CardAllocation[] = [];
  for (const charge of charges) {
    const existing = (charge.payments ?? []).find(
      (payment: any) => String(payment.sourceRef) === String(sourceId)
    );
    if (existing) {
      allocations.push({
        chargeId: charge._id,
        amountCents: existing.amountCents,
        reversedCents: existing.reversedCents ?? 0,
        ledgerPaymentId: existing._id,
      });
      // Posted by a run whose write landed after our `alreadyPosted` read.
      // Without this the money stays in `remaining` and is banked a second
      // time as credit, so the member is both charged and credited for it.
      if (!countedPaymentIds.has(String(existing._id))) {
        remaining = Math.max(0, remaining - (Number(existing.amountCents) || 0));
      }
      continue;
    }
    if (remaining <= 0) continue;
    const applied = Math.min(remaining, balanceCentsFor(charge));
    if (applied <= 0) continue;
    charge.payments.push({
      amountCents: applied,
      reversedCents: 0,
      method: input.method,
      reference: input.reference.slice(0, 300),
      paidOn: input.paidOn,
      recordedAt: new Date(),
      recordedBy: null,
      sourceRef: sourceId,
    });
    await charge.save();
    const created = charge.payments[charge.payments.length - 1];
    allocations.push({
      chargeId: charge._id,
      amountCents: applied,
      reversedCents: 0,
      ledgerPaymentId: created?._id ?? null,
    });
    remaining -= applied;
  }

  // Whatever the balance could not absorb is the member's, held as credit.
  let creditCents = existingCreditCents;
  if (remaining > 0 && !existingCredit) {
    await CreditEntry.create({
      memberId,
      amountCents: remaining,
      type: "earned",
      occurredAt: input.paidOn,
      refs: { [creditRef]: sourceId },
      actorId: null,
      note: input.creditNote,
    });
    creditCents += remaining;
  }

  return { allocations, creditCents };
}

export interface ReconcileCardReversalInput {
  /// A live `OnlineDuesPayment` or `TerminalPayment` document. The two models
  /// deliberately share field names so this works on either.
  row: any;
  creditRef: CardCreditRef;
  refundedCents: number;
  disputed: boolean;
  disputeId?: string | null;
  disputeStatus?: string | null;
}

export interface ReconcileCardReversalResult {
  /// False when Stripe told us nothing we had not already recorded, which is
  /// the common case on a redelivered webhook. Callers use it to avoid writing
  /// a duplicate history line.
  changed: boolean;
  reversedCents: number;
  status: string;
}

/// Make the ledger agree with Stripe's current refunded or disputed amount,
/// without deleting the original payment rows. A reversal is recorded by
/// raising `reversedCents` on the row it reverses, so the history keeps saying
/// the payment happened.
export async function reconcileCardReversal(
  input: ReconcileCardReversalInput
): Promise<ReconcileCardReversalResult> {
  const { row, creditRef } = input;
  const previousStatus = row.status;
  const previousAllocationReversed = (row.allocations ?? []).reduce(
    (sum: number, allocation: any) => sum + (Number(allocation.reversedCents) || 0),
    0
  );

  const desired = Math.min(
    row.principalCents,
    input.disputed ? row.principalCents : Math.max(0, input.refundedCents)
  );

  const nextStatus = input.disputed
    ? "disputed"
    : desired >= row.principalCents
      ? "refunded"
      : desired > 0
        ? "partially_refunded"
        : "succeeded";

  // Money that never reached a member's ledger — an unassigned in-person
  // payment — has nothing to reverse. Record the new state and stop.
  if (!row.memberId) {
    row.refundedCents = Math.max(0, input.refundedCents);
    row.disputeId = input.disputeId ?? row.disputeId;
    row.disputeStatus = input.disputeStatus ?? row.disputeStatus;
    row.status = nextStatus;
    await row.save();
    return {
      changed: previousStatus !== nextStatus,
      reversedCents: desired,
      status: nextStatus,
    };
  }

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
  // Unconditional on purpose. `originalCredit` is what the credit *should* be,
  // derived from the payment itself, so writing it also corrects an entry that
  // should never have existed — the guard this replaced skipped exactly the
  // rows that were wrong. Matching nothing is a no-op.
  await CreditEntry.findOneAndUpdate(
    { [`refs.${creditRef}`]: row._id },
    { amountCents: Math.max(0, originalCredit - creditReversed) }
  );

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
  row.status = nextStatus;
  for (const allocation of row.allocations as any[]) {
    const charge = charges.find(
      (item: any) => String(item._id) === String(allocation.chargeId)
    );
    const ledger = charge?.payments?.find(
      (payment: any) => String(payment._id) === String(allocation.ledgerPaymentId)
    );
    allocation.reversedCents = Number(ledger?.reversedCents) || 0;
  }
  await row.save();

  const currentReversed =
    (row.allocations ?? []).reduce(
      (sum: number, allocation: any) =>
        sum + (Number(allocation.reversedCents) || 0),
      0
    ) + creditReversed;

  return {
    changed: previousStatus !== row.status || previousReversed !== currentReversed,
    reversedCents: currentReversed,
    status: row.status,
  };
}

/// Undo every ledger row a payment created, leaving the payment itself intact.
///
/// Used when an in-person payment is reassigned from one member to another: the
/// money did not move at Stripe, so this is bookkeeping, but the first member's
/// balance has to go back to what it was before somebody guessed wrong.
export async function unpostCardPayment(input: {
  memberId: any;
  sourceId: any;
  creditRef: CardCreditRef;
}): Promise<{ removedCents: number }> {
  let removedCents = 0;
  const charges = await DuesCharge.find({
    memberId: input.memberId,
    "payments.sourceRef": input.sourceId,
  });
  for (const charge of charges as any[]) {
    const keep: any[] = [];
    for (const payment of charge.payments) {
      if (String(payment.sourceRef) === String(input.sourceId)) {
        removedCents += Math.max(
          0,
          (Number(payment.amountCents) || 0) - (Number(payment.reversedCents) || 0)
        );
        continue;
      }
      keep.push(payment);
    }
    charge.payments = keep;
    await charge.save();
  }
  const credit = await CreditEntry.findOneAndDelete({
    [`refs.${input.creditRef}`]: input.sourceId,
  }).lean<any>();
  if (credit) removedCents += Math.max(0, Number(credit.amountCents) || 0);
  return { removedCents };
}
