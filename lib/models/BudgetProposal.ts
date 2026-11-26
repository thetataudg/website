// lib/models/BudgetProposal.ts
import mongoose, { Schema, model, models } from "mongoose";

/// What a committee asks for at the start of a term, before the chapter votes.
///
/// One per committee per term. `committeeId: null` is the chapter-level
/// proposal the treasurer owns (nationals, insurance, reserve), so the package
/// the chapter votes on is just "every proposal for the term".
///
/// Versioned in place rather than as separate documents: each submit or
/// treasurer edit bumps `version` and pushes the outgoing version onto
/// `history` in the same update. One document write, so the current version
/// and its history can never disagree on a database without transactions.
export const PROPOSAL_STATUSES = [
  "draft",
  "submitted",
  "returned",
  "approved",
  "rejected",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const ProposalLineSchema = new Schema(
  {
    name: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
  },
  { _id: true }
);

const ProposalVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    lines: { type: [ProposalLineSchema], default: [] },
    expectedIncomeCents: { type: Number, default: 0 },
    note: { type: String, default: "" },
    editedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    editedAt: { type: Date, required: true },
    /// What produced this version: the head saving, submitting, or the
    /// treasurer editing it directly.
    action: {
      type: String,
      enum: ["saved", "submitted", "treasurer_edit"],
      required: true,
    },
  },
  { _id: false }
);

const BudgetProposalSchema = new Schema(
  {
    term: { type: String, required: true },
    committeeId: {
      type: Schema.Types.ObjectId,
      ref: "Committee",
      default: null,
    },
    status: { type: String, enum: PROPOSAL_STATUSES, default: "draft" },
    version: { type: Number, default: 1 },
    /// What produced the current version. A head's unsubmitted draft
    /// ("saved") is overwritten in place, since nobody else has seen it; any
    /// later change to a submitted or treasurer-edited version pushes that
    /// version onto `history` first. See `planProposalWrite` in lib/budgets.ts.
    currentAction: {
      type: String,
      enum: ["saved", "submitted", "treasurer_edit"],
      default: "saved",
    },
    lines: { type: [ProposalLineSchema], default: [] },
    expectedIncomeCents: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "" },
    /// The treasurer's note on the last send-back, shown to the head.
    reviewNote: { type: String, default: "" },
    submittedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    submittedAt: { type: Date, default: null },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    history: { type: [ProposalVersionSchema], default: [] },
  },
  { timestamps: true }
);

// One proposal per committee per term, and one chapter-level proposal per term
// (Mongo treats null as a value in a unique index, which is what we want).
BudgetProposalSchema.index({ term: 1, committeeId: 1 }, { unique: true });
BudgetProposalSchema.index({ term: 1, status: 1 });

if (process.env.NODE_ENV === "development" && models.BudgetProposal) {
  delete models.BudgetProposal;
}

const BudgetProposal =
  models.BudgetProposal || model("BudgetProposal", BudgetProposalSchema);
export default BudgetProposal;
