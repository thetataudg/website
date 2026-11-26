// lib/models/CommitteeBudget.ts
import mongoose, { Schema, model, models } from "mongoose";

/// A committee's live budget for one term.
///
/// Holds names, not money. Every dollar on it comes from a `BudgetEntry` or an
/// approved committee `Reimbursement`, and the numbers are derived by
/// `lib/budgets.ts` at read time: the same "never store a balance" rule the
/// dues ledger follows.
///
/// Lines are archived, never deleted, so old entries always have a name to
/// point at. Money that is not on any line sits on the implicit Unassigned
/// line (`lineId: null`).
const BudgetLineSchema = new Schema(
  {
    name: { type: String, required: true },
    archived: { type: Boolean, default: false },
  },
  { _id: true }
);

const CommitteeBudgetSchema = new Schema(
  {
    committeeId: {
      type: Schema.Types.ObjectId,
      ref: "Committee",
      required: true,
    },
    term: { type: String, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    lines: { type: [BudgetLineSchema], default: [] },
    proposalId: { type: Schema.Types.ObjectId, ref: "BudgetProposal", default: null },
    packageId: { type: Schema.Types.ObjectId, ref: "BudgetPackage", default: null },
    /// Which 80% / 100% warnings have already gone out, so each fires once.
    thresholdsNotified: { type: [Number], default: [] },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

CommitteeBudgetSchema.index({ committeeId: 1, term: 1 }, { unique: true });
CommitteeBudgetSchema.index({ term: 1 });

if (process.env.NODE_ENV === "development" && models.CommitteeBudget) {
  delete models.CommitteeBudget;
}

const CommitteeBudget =
  models.CommitteeBudget || model("CommitteeBudget", CommitteeBudgetSchema);
export default CommitteeBudget;
