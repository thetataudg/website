// lib/models/BudgetPackage.ts
import mongoose, { Schema, model, models } from "mongoose";

/// What the chapter actually votes on.
///
/// Normally the whole term at once (`kind: "term"`). The treasurer can also put
/// one committee to its own vote (`"single"`), or bring a mid-term change to
/// the floor (`"amendment"`); all three share this shape so there is exactly
/// one approval path.
///
/// `items` freezes the proposal versions at the moment voting opens. If a
/// proposal is edited afterward, the record of what the chapter approved does
/// not move with it.
export const PACKAGE_KINDS = ["term", "single", "amendment"] as const;
export const PACKAGE_STATUSES = ["draft", "voting", "approved", "rejected"] as const;

const PackageItemSchema = new Schema(
  {
    proposalId: { type: Schema.Types.ObjectId, ref: "BudgetProposal", required: true },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    version: { type: Number, required: true },
    totalCents: { type: Number, required: true },
    expectedIncomeCents: { type: Number, default: 0 },
    /// Set once approval has created this committee's budget and allocations.
    /// Approval marks the package first and then applies each item, so an
    /// interrupted approval can be finished by running it again.
    applied: { type: Boolean, default: false },
  },
  { _id: false }
);

const BudgetPackageSchema = new Schema(
  {
    term: { type: String, required: true, index: true },
    kind: { type: String, enum: PACKAGE_KINDS, default: "term" },
    status: { type: String, enum: PACKAGE_STATUSES, default: "draft" },
    title: { type: String, default: "" },
    items: { type: [PackageItemSchema], default: [] },
    /// Amendments only: more money for one committee mid-term.
    amendment: {
      committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
      budgetId: { type: Schema.Types.ObjectId, ref: "CommitteeBudget", default: null },
      lineId: { type: Schema.Types.ObjectId, default: null },
      amountCents: { type: Number, default: 0 },
      reason: { type: String, default: "" },
      applied: { type: Boolean, default: false },
    },
    totalCents: { type: Number, default: 0 },
    expectedIncomeCents: { type: Number, default: 0 },
    carryoverCents: { type: Number, default: 0 },
    activeCount: { type: Number, default: 0 },
    suggestedDuesCents: { type: Number, default: null },
    finalDuesCents: { type: Number, default: null },
    duesAssignedAt: { type: Date, default: null },
    duesAssignedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    approval: {
      method: { type: String, enum: ["app", "recorded", null], default: null },
      voteId: { type: Schema.Types.ObjectId, ref: "Vote", default: null },
      yes: { type: Number, default: null },
      no: { type: Number, default: null },
      abstain: { type: Number, default: null },
      date: { type: Date, default: null },
      recordedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
      note: { type: String, default: "" },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

BudgetPackageSchema.index({ term: 1, status: 1 });

if (process.env.NODE_ENV === "development" && models.BudgetPackage) {
  delete models.BudgetPackage;
}

const BudgetPackage =
  models.BudgetPackage || model("BudgetPackage", BudgetPackageSchema);
export default BudgetPackage;
