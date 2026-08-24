// lib/credit.ts
// The chapter's debt to its members: what it owes, and how that gets absorbed
// by dues or handed back in cash.
import mongoose from "mongoose";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import CreditEntry from "@/lib/models/CreditEntry";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import logger from "@/lib/logger";

/// Credit is derived, never stored — the same discipline the dues balance
/// follows.
///
/// It has two halves. `CreditEntry` records money coming in (an approved
/// reimbursement) and going back out (a payout). Credit *spent on dues* is not
/// recorded here at all: it lives in the charge's own `payments[]` as a
/// `credit` payment, because that's where the balance math already looks. So:
///
///     credit = sum(entries) − sum(credit payments on live charges)
///
/// Writing the spend in one place instead of two is what makes this safe on a
/// database with no transactions. There is no second row that can fail to be
/// written and leave the two halves disagreeing.
export async function creditBalanceCents(memberId: any): Promise<number> {
  const [ledger, applied] = await Promise.all([
    creditLedgerCents([memberId]),
    creditAppliedCents([memberId]),
  ]);
  const key = String(memberId);
  return Math.max(0, (ledger.get(key) ?? 0) - (applied.get(key) ?? 0));
}

/// Batch version, for the roster — one aggregation for the whole chapter
/// rather than two queries per member.
export async function creditBalancesFor(
  memberIds: any[]
): Promise<Map<string, number>> {
  if (!memberIds.length) return new Map();
  const [ledger, applied] = await Promise.all([
    creditLedgerCents(memberIds),
    creditAppliedCents(memberIds),
  ]);
  const balances = new Map<string, number>();
  for (const id of memberIds) {
    const key = String(id);
    balances.set(
      key,
      Math.max(0, (ledger.get(key) ?? 0) - (applied.get(key) ?? 0))
    );
  }
  return balances;
}

async function creditLedgerCents(memberIds: any[]): Promise<Map<string, number>> {
  const rows = await CreditEntry.aggregate([
    { $match: { memberId: { $in: memberIds.map(toObjectId) } } },
    { $group: { _id: "$memberId", total: { $sum: "$amountCents" } } },
  ]);
  return new Map(rows.map((row: any) => [String(row._id), Number(row.total) || 0]));
}

/// Credit already absorbed by charges.
///
/// Void charges are excluded on purpose: voiding means the charge should never
/// have existed, so any credit spent on it comes back to the member. Waiving is
/// different — that's a deliberate forgiveness of a real debt, and credit
/// already applied to it stays spent. An officer who wants to undo that removes
/// the payment.
async function creditAppliedCents(memberIds: any[]): Promise<Map<string, number>> {
  const rows = await DuesCharge.aggregate([
    { $match: { memberId: { $in: memberIds.map(toObjectId) }, status: { $ne: "void" } } },
    { $unwind: "$payments" },
    { $match: { "payments.method": "credit" } },
    { $group: { _id: "$memberId", total: { $sum: "$payments.amountCents" } } },
  ]);
  return new Map(rows.map((row: any) => [String(row._id), Number(row.total) || 0]));
}

function toObjectId(value: any) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

/// Records that the chapter now owes this member money.
export async function mintCredit(input: {
  memberId: any;
  amountCents: number;
  actorId?: any;
  reimbursementId?: any;
  note?: string;
}) {
  return CreditEntry.create({
    memberId: input.memberId,
    amountCents: Math.round(input.amountCents),
    type: "earned",
    occurredAt: new Date(),
    refs: { reimbursementId: input.reimbursementId ?? null },
    actorId: input.actorId ?? null,
    note: input.note ?? "",
  });
}

export interface CreditApplication {
  appliedCents: number;
  remainingCreditCents: number;
  charges: Array<{ chargeId: string; description: string; appliedCents: number }>;
}

/// Drains a member's credit into whatever they currently owe, oldest due date
/// first.
///
/// Runs at the two moments credit and debt can meet: a reimbursement being
/// approved, and a charge being raised. The result is the invariant the UI
/// depends on — a member either owes something or is owed something, never
/// both — which is what lets every screen show one headline instead of trying
/// to reconcile two numbers in front of the reader.
export async function applyCreditToOpenCharges(
  memberId: any,
  actorId: any = null
): Promise<CreditApplication> {
  let available = await creditBalanceCents(memberId);
  const result: CreditApplication = {
    appliedCents: 0,
    remainingCreditCents: available,
    charges: [],
  };
  if (available <= 0) return result;

  // Oldest due date first, so credit clears the debt that is closest to being
  // late rather than whichever charge happens to sort first.
  const charges = await DuesCharge.find({ memberId, status: "open" }).sort({
    dueDate: 1,
    createdAt: 1,
  });

  for (const charge of charges) {
    if (available <= 0) break;
    const owed = balanceCentsFor(charge);
    if (owed <= 0) continue;

    const applied = Math.min(available, owed);
    charge.payments.push({
      amountCents: applied,
      method: "credit",
      reference: "Reimbursement credit",
      paidOn: new Date(),
      recordedAt: new Date(),
      recordedBy: actorId,
      sourceRef: null,
    });
    await charge.save();

    available -= applied;
    result.appliedCents += applied;
    result.charges.push({
      chargeId: String(charge._id),
      description: charge.description,
      appliedCents: applied,
    });

    const nowOwed = balanceCentsFor(charge);
    await recordFinanceEvent({
      memberId,
      actorId,
      type: "credit_applied",
      amountCents: applied,
      summary:
        `${formatCents(applied)} credit applied to ${charge.description}. ` +
        (nowOwed > 0 ? `${formatCents(nowOwed)} still owed.` : "Balance settled."),
      refs: { chargeId: charge._id },
      meta: { remainingCreditCents: available },
    });

    // Officers only, deliberately. Credit application is never a standalone
    // act — it happens inside a reimbursement approval or a charge being
    // raised, and both of those already send the member a message that says
    // where the money went. A second push a half-second later saying the same
    // thing in ledger language is how notification fatigue starts.
    await announce({
      event: "credit_applied",
      memberId,
      actorId,
      amountCents: applied,
      summary:
        `${formatCents(applied)} credit applied to ${charge.description}. ` +
        (nowOwed > 0 ? `${formatCents(nowOwed)} still owed.` : "Balance settled."),
      refs: { chargeId: charge._id },
    });
  }

  result.remainingCreditCents = available;
  if (result.appliedCents > 0) {
    logger.info(
      { memberId: String(memberId), applied: result.appliedCents, remaining: available },
      "Credit applied to open charges"
    );
  }
  return result;
}

/// Hands credit back as actual money. The app records the payout; a human moves
/// the funds.
export async function payOutCredit(input: {
  memberId: any;
  amountCents: number;
  method: string;
  reference?: string;
  proofUrl?: string;
  actorId: any;
  note?: string;
}) {
  const entry = await CreditEntry.create({
    memberId: input.memberId,
    // Negative: this is the chapter's debt shrinking.
    amountCents: -Math.abs(Math.round(input.amountCents)),
    type: "paid_out",
    occurredAt: new Date(),
    payout: {
      method: input.method,
      reference: input.reference ?? "",
      proofUrl: input.proofUrl ?? "",
    },
    actorId: input.actorId,
    note: input.note ?? "",
  });

  await recordFinanceEvent({
    memberId: input.memberId,
    actorId: input.actorId,
    type: "credit_paid_out",
    amountCents: -Math.abs(Math.round(input.amountCents)),
    summary: `Paid out ${formatCents(Math.abs(input.amountCents))} by ${input.method}${input.reference ? `, reference ${input.reference}` : ""}`,
    refs: { creditEntryId: entry._id },
    meta: { method: input.method, reference: input.reference ?? "" },
  });

  await announce({
    event: "credit_paid_out",
    memberId: input.memberId,
    actorId: input.actorId,
    amountCents: -Math.abs(Math.round(input.amountCents)),
    summary: `Paid out ${formatCents(Math.abs(input.amountCents))} by ${input.method}${input.reference ? `, reference ${input.reference}` : ""}`,
    refs: {},
    member: {
      template: "credit_paid_out",
      context: {
        amountCents: Math.abs(Math.round(input.amountCents)),
        method: input.method,
      },
    },
  });

  return entry;
}

export interface CreditEntryDTO {
  _id: string;
  amountCents: number;
  type: string;
  occurredAt: string | null;
  note: string;
  payout: { method: string | null; reference: string; proofUrl: string } | null;
}

export function serializeCreditEntry(entry: any): CreditEntryDTO {
  return {
    _id: entry?._id?.toString?.() ?? "",
    amountCents: Number(entry?.amountCents) || 0,
    type: entry?.type ?? "adjustment",
    occurredAt: entry?.occurredAt
      ? new Date(entry.occurredAt).toISOString()
      : null,
    note: entry?.note ?? "",
    payout:
      entry?.type === "paid_out"
        ? {
            method: entry?.payout?.method ?? null,
            reference: entry?.payout?.reference ?? "",
            proofUrl: entry?.payout?.proofUrl ?? "",
          }
        : null,
  };
}
