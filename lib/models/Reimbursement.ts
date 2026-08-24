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
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    reviewedAt: { type: Date, default: null },
    /// Required on denial, and shown to the member.
    reviewNote: { type: String, default: "" },
    /// The credit approval minted, so the two can be read together.
    creditEntryId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

ReimbursementSchema.index({ memberId: 1, createdAt: -1 });
ReimbursementSchema.index({ status: 1, createdAt: 1 });

if (process.env.NODE_ENV === "development" && models.Reimbursement) {
  delete models.Reimbursement;
}

const Reimbursement =
  models.Reimbursement || model("Reimbursement", ReimbursementSchema);
export default Reimbursement;
