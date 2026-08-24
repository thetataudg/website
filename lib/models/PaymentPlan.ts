// lib/models/PaymentPlan.ts
import mongoose, { Schema, model, models } from "mongoose";

/// A member's schedule for clearing what they owe, on terms they proposed.
///
/// The installments carry only a sequence, a date and an amount. Whether one is
/// paid is *derived* from how much has landed on the covered charges — see
/// `lib/plans.ts`. Storing a paid flag would mean every route that touches
/// money had to remember to advance the plan too, and the one that forgot would
/// leave a member being chased for an installment they'd already settled.
const InstallmentSchema = new Schema(
  {
    seq: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amountCents: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const PaymentPlanSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    term: { type: String, required: true },
    /// Locked at proposal. A charge raised later doesn't join an existing plan
    /// — it gets its own due date, and the member can propose a new plan that
    /// supersedes this one.
    chargeIds: { type: [Schema.Types.ObjectId], default: [] },
    /// What was outstanding when the plan was proposed.
    totalCents: { type: Number, required: true, min: 1 },
    /// What had already been paid on those charges at that moment, so progress
    /// measures this plan rather than the member's whole history.
    baselinePaidCents: { type: Number, required: true, default: 0 },
    installments: { type: [InstallmentSchema], default: [] },

    /// The date the whole thing hangs on.
    ///
    /// Chapter bylaws let a member onto a plan if they asked before their dues
    /// were due. Filing is the member's act; approving is somebody else's, and
    /// could take a week. Measuring from the filing is what stops treasurer
    /// latency from making a member retroactively late.
    proposedAt: { type: Date, required: true, default: () => new Date() },
    /// The charge due date this was filed against, kept so the record explains
    /// itself years later without re-reading the charge.
    proposedAgainstDueDate: { type: Date, default: null },

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "denied",
        "completed",
        "defaulted",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    requestNote: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    reviewedAt: { type: Date, default: null },
    /// Required on denial. A denied plan sends the member back to owing the
    /// full amount, so they need to know why — and they get a grace window
    /// rather than waking up overdue.
    reviewNote: { type: String, default: "" },
    graceUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

PaymentPlanSchema.index({ memberId: 1, status: 1 });
PaymentPlanSchema.index({ status: 1, proposedAt: 1 });

if (process.env.NODE_ENV === "development" && models.PaymentPlan) {
  delete models.PaymentPlan;
}

const PaymentPlan = models.PaymentPlan || model("PaymentPlan", PaymentPlanSchema);
export default PaymentPlan;
