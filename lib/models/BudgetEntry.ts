// lib/models/BudgetEntry.ts
import mongoose, { Schema, model, models } from "mongoose";

/// One movement of committee money that is not a reimbursement.
///
/// Append-only. A mistake is fixed with a `reversal` pointing at the original,
/// never by editing it, so the ledger always says what happened and in what
/// order.
///
/// Transfers (between committees, or between lines of one committee) and
/// rollovers are a single row with `from` and `to`. Writing them as a debit
/// row and a credit row would be two writes with nothing to make them land
/// together, and a crash between them would create or destroy money.
export const BUDGET_ENTRY_KINDS = [
  "allocation", // starting money, from an approved proposal or set by hand
  "adjustment", // signed: the treasurer raises or lowers a total mid-term
  "income", // money the committee brought in
  "direct_spend", // chapter card or check purchase, no reimbursement involved
  "transfer", // from -> to, both sides on budgets
  "rollover", // from last term -> this term; `to` null means returned to the chapter
  "reversal", // cancels `reversesEntryId`
] as const;

export type BudgetEntryKind = (typeof BUDGET_ENTRY_KINDS)[number];

const SideSchema = new Schema(
  {
    budgetId: { type: Schema.Types.ObjectId, ref: "CommitteeBudget", default: null },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    lineId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const BudgetEntrySchema = new Schema(
  {
    kind: { type: String, enum: BUDGET_ENTRY_KINDS, required: true },
    term: { type: String, required: true },
    /// The budget a single-sided entry belongs to. Unset on transfers and
    /// rollovers, which use `from` and `to` instead.
    budgetId: { type: Schema.Types.ObjectId, ref: "CommitteeBudget", default: null },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    lineId: { type: Schema.Types.ObjectId, default: null },
    from: { type: SideSchema, default: null },
    to: { type: SideSchema, default: null },
    /// Positive for everything except `adjustment`, which is signed.
    amountCents: { type: Number, required: true },
    note: { type: String, default: "" },
    receiptUrls: { type: [String], default: [] },
    /// For `direct_spend`: when the purchase was actually made.
    occurredOn: { type: Date, default: null },
    reversesEntryId: { type: Schema.Types.ObjectId, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    refs: {
      packageId: { type: Schema.Types.ObjectId, default: null },
      proposalId: { type: Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true }
);

BudgetEntrySchema.index({ budgetId: 1, occurredAt: 1 });
BudgetEntrySchema.index({ "from.budgetId": 1 });
BudgetEntrySchema.index({ "to.budgetId": 1 });
// A given entry can be reversed at most once.
BudgetEntrySchema.index(
  { reversesEntryId: 1 },
  { unique: true, partialFilterExpression: { reversesEntryId: { $type: "objectId" } } }
);

if (process.env.NODE_ENV === "development" && models.BudgetEntry) {
  delete models.BudgetEntry;
}

const BudgetEntry = models.BudgetEntry || model("BudgetEntry", BudgetEntrySchema);
export default BudgetEntry;
