import mongoose, { Schema, model, models } from "mongoose";

export const ONLINE_DUES_PAYMENT_STATUSES = [
  "creating",
  "requires_payment_method",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "partially_refunded",
  "refunded",
  "disputed",
] as const;

const AllocationSchema = new Schema(
  {
    chargeId: { type: Schema.Types.ObjectId, ref: "DuesCharge", required: true },
    amountCents: { type: Number, required: true, min: 1 },
    reversedCents: { type: Number, default: 0, min: 0 },
    ledgerPaymentId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

/// One member-authorized Stripe payment. The Stripe amount includes any fee;
/// `principalCents` is the only part that reduces dues.
const OnlineDuesPaymentSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    requestedKind: {
      type: String,
      enum: ["installment", "custom", "full"],
      required: true,
    },
    principalCents: { type: Number, required: true, min: 1 },
    feeCents: { type: Number, required: true, default: 0, min: 0 },
    totalCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "usd" },
    allocations: { type: [AllocationSchema], default: [] },

    stripePaymentIntentId: { type: String, default: null },
    stripeChargeId: { type: String, default: null },
    paymentMethod: {
      type: String,
      enum: ["unknown", "card", "apple_pay", "us_bank_account"],
      default: "unknown",
    },
    status: {
      type: String,
      enum: ONLINE_DUES_PAYMENT_STATUSES,
      default: "creating",
      index: true,
    },
    failureMessage: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    ledgerPostedAt: { type: Date, default: null },
    refundedCents: { type: Number, default: 0, min: 0 },
    disputeId: { type: String, default: null },
    disputeStatus: { type: String, default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OnlineDuesPaymentSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripePaymentIntentId: { $type: "string" } },
  }
);
OnlineDuesPaymentSchema.index({ memberId: 1, createdAt: -1 });

if (process.env.NODE_ENV === "development" && models.OnlineDuesPayment) {
  delete models.OnlineDuesPayment;
}

const OnlineDuesPayment =
  models.OnlineDuesPayment || model("OnlineDuesPayment", OnlineDuesPaymentSchema);
export default OnlineDuesPayment;

