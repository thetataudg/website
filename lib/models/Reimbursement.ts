// lib/models/Reimbursement.ts
import mongoose, { Schema, model, models } from "mongoose";

/// A member's claim for money they spent on the chapter's behalf.
///
/// Submit any time — there's no deadline on these, and no balance required.
/// Approval mints credit; where that credit then goes is the credit ledger's
/// business, not this record's. That's why there's no `appliedCents` here: a
/// claim is a claim, and it doesn't change after it's reviewed.
export const REIMBURSEMENT_CATEGORIES = [
  "rush",
  "philanthropy",
  "brotherhood",
  "service",
  "professionalism",
  "supplies",
  "travel",
  "other",
] as const;

export const REIMBURSEMENT_STATUSES = [
  "pending",
  "approved",
  "denied",
  "returned", // sent back to the head to fix and resubmit
  "withdrawn", // pulled by the head before review
  "fulfilled", // a pre-approval whose claim has been approved
  "released", // a pre-approval whose hold was let go unused
] as const;

export const PAYOUT_METHODS = [
  "credit",
  "cash",
  "venmo",
  "zelle",
  "check",
  "other",
] as const;

const ReimbursementSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    term: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 1 },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: REIMBURSEMENT_CATEGORIES,
      default: "other",
    },
    purchasedOn: { type: Date, required: true },
    /// Object keys from the existing Garage/S3 upload route.
    receiptUrls: { type: [String], default: [] },
    /// `returned`, `withdrawn`, `fulfilled` and `released` only occur on
    /// committee requests; a general reimbursement still only moves between
    /// pending, approved and denied. See `REQUEST_TRANSITIONS` in
    /// `lib/budgets.ts` for which moves are legal.
    status: {
      type: String,
      enum: REIMBURSEMENT_STATUSES,
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    reviewedAt: { type: Date, default: null },
    /// Required on denial, and shown to the member.
    reviewNote: { type: String, default: "" },
    /// The credit approval minted, so the two can be read together.
    creditEntryId: { type: Schema.Types.ObjectId, default: null },

    // ---- Committee budget fields. All unset on a general reimbursement,
    // which keeps behaving exactly as it did before budgets existed.

    /// Set means this is committee money and only that committee's head may
    /// file it; the treasurer reviews it against the budget.
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    budgetId: { type: Schema.Types.ObjectId, ref: "CommitteeBudget", default: null },
    /// Null is the budget's Unassigned line.
    lineId: { type: Schema.Types.ObjectId, default: null },
    /// A `claim` is money already spent, with a receipt. A `preapproval` asks
    /// before buying, and once approved holds that money on the budget.
    kind: { type: String, enum: ["claim", "preapproval"], default: "claim" },
    /// What the treasurer approved. May be less than `amountCents`, which
    /// stays as what was asked for. Null until approved.
    approvedCents: { type: Number, default: null, min: 0 },
    /// True only when approving took the committee past zero, and the
    /// treasurer ticked the box that says they meant to.
    overBudgetOverride: { type: Boolean, default: false },
    /// A claim filed against an approved pre-approval.
    preapprovalId: { type: Schema.Types.ObjectId, default: null },
    /// Who filed it. `memberId` is who gets paid, and for committee requests
    /// the two are the same person; it is kept apart so a head change never
    /// rewrites who submitted what.
    submittedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    /// Times the head has resubmitted after a send-back.
    revision: { type: Number, default: 0 },
    /// Committee claims are paid as a separate step after approval, by hand
    /// or as dues credit. General reimbursements never set this: approval
    /// mints credit at once, as it always has.
    payout: {
      status: { type: String, enum: ["unpaid", "paid", null], default: null },
      method: {
        type: String,
        enum: [...PAYOUT_METHODS, null],
        default: null,
      },
      reference: { type: String, default: "" },
      proofUrl: { type: String, default: "" },
      paidAt: { type: Date, default: null },
      paidBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
      creditEntryId: { type: Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true }
);

ReimbursementSchema.index({ memberId: 1, createdAt: -1 });
ReimbursementSchema.index({ status: 1, createdAt: 1 });
ReimbursementSchema.index({ budgetId: 1, status: 1 });
ReimbursementSchema.index({ committeeId: 1, createdAt: -1 });

if (process.env.NODE_ENV === "development" && models.Reimbursement) {
  delete models.Reimbursement;
}

const Reimbursement =
  models.Reimbursement || model("Reimbursement", ReimbursementSchema);
export default Reimbursement;
