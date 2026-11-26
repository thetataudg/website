// lib/models/BudgetTerm.ts
import mongoose, { Schema, model, models } from "mongoose";

/// A semester's budget cycle: whether heads may still submit proposals.
///
/// The window is opened and closed by hand. A head can draft and submit only
/// while `proposalsOpen` is true; the treasurer can still edit or send back
/// proposals after it closes, right up to the vote.
const BudgetTermSchema = new Schema(
  {
    /// "Fall 2026": the same string dues charges use for `term`.
    term: { type: String, required: true, unique: true },
    proposalsOpen: { type: Boolean, default: true },
    openedAt: { type: Date, required: true, default: () => new Date() },
    openedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    proposalsClosedAt: { type: Date, default: null },
    proposalsClosedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === "development" && models.BudgetTerm) {
  delete models.BudgetTerm;
}

const BudgetTerm = models.BudgetTerm || model("BudgetTerm", BudgetTermSchema);
export default BudgetTerm;
