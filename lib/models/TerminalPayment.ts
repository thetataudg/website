// lib/models/TerminalPayment.ts
import mongoose, { Schema, model, models } from "mongoose";

export const TERMINAL_PAYMENT_STATUSES = [
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

/// What the officer said the money was for at the moment they took it.
///
/// `general` is the one that makes this collection necessary: money accepted
/// before anybody knew whose it was. It touches no member ledger until somebody
/// assigns it, and it is a legitimate resting state, not an error.
export const TERMINAL_PAYMENT_PURPOSES = [
  "charge",
  "member",
  "general",
  "donation",
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

/// One card payment taken in person, on an officer's iPhone, with Tap to Pay.
///
/// Field names deliberately mirror `OnlineDuesPayment` wherever they mean the
/// same thing — `principalCents`, `allocations`, `status`, `refundedCents`,
/// `memberId` — because `lib/cardPayments.ts` operates on either model and the
/// alternative is two copies of the hardest code in the treasury.
const TerminalPaymentSchema = new Schema(
  {
    /// The officer who held the phone. Required, always: a card payment with
    /// nobody's name against it is the one thing this collection must never
    /// contain.
    operatorId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: TERMINAL_PAYMENT_PURPOSES,
      required: true,
    },
    /// Whose money this is. Null while the payment is unassigned, which is why
    /// this is the one payment model in the system where it is not required.
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      default: null,
      index: true,
    },
    /// Set when the officer started from a specific charge rather than from the
    /// roster. A preference for the allocator, not a constraint.
    chargeId: { type: Schema.Types.ObjectId, ref: "DuesCharge", default: null },
    /// Set when `purpose` is "donation" — the donation row this payment funded.
    donationId: { type: Schema.Types.ObjectId, default: null },

    principalCents: { type: Number, required: true, min: 50 },
    feeCents: { type: Number, required: true, default: 0, min: 0 },
    totalCents: { type: Number, required: true, min: 50 },
    currency: { type: String, default: "usd" },

    /// What the officer typed on the phone. This is what the payment is called
    /// everywhere it is later shown, so it is required in the route even though
    /// the schema tolerates an empty string on legacy rows.
    description: { type: String, default: "", maxlength: 200 },
    /// Who handed over the card, when they are not a member on the roster.
    payerName: { type: String, default: "", maxlength: 120 },
    payerEmail: { type: String, default: "", maxlength: 200 },
    note: { type: String, default: "", maxlength: 500 },

    allocations: { type: [AllocationSchema], default: [] },

    stripePaymentIntentId: { type: String, default: null },
    stripeChargeId: { type: String, default: null },
    /// Card details Stripe returns on a `card_present` charge. Kept so a
    /// treasurer can match a line on a Stripe payout to a row in the ledger,
    /// which is the first thing anyone needs during a dispute.
    cardBrand: { type: String, default: "" },
    last4: { type: String, default: "" },
    /// "apple_pay", "google_pay", "samsung_pay", or empty for a plain card.
    walletType: { type: String, default: "" },

    /// Which Stripe Terminal location and which phone took it.
    locationId: { type: String, default: "" },
    readerSerial: { type: String, default: "" },

    status: {
      type: String,
      enum: TERMINAL_PAYMENT_STATUSES,
      default: "creating",
      index: true,
    },
    failureMessage: { type: String, default: "" },

    /// Stamped when the phone finishes confirming, before any webhook lands.
    confirmedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    ledgerPostedAt: { type: Date, default: null },

    refundedCents: { type: Number, default: 0, min: 0 },
    disputeId: { type: String, default: null },
    disputeStatus: { type: String, default: null },

    /// How this payment found its owner, when it did not start with one.
    ///
    /// `previousMemberIds` is the reason this is a subdocument rather than two
    /// loose fields: reassigning money away from somebody is a thing their
    /// history should be able to explain later, and the ledger rows are gone by
    /// then.
    assignment: {
      assignedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
      assignedAt: { type: Date, default: null },
      previousMemberIds: { type: [Schema.Types.ObjectId], default: [] },
    },

    notifiedAt: { type: Date, default: null },
    /// Stamped when the operator has been told this payment failed. Separate
    /// from `notifiedAt`, which covers the success fanout: a payment can fail,
    /// be retried by Stripe, and fail again, and the webhook redelivers freely.
    failureNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TerminalPaymentSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripePaymentIntentId: { $type: "string" } },
  }
);
TerminalPaymentSchema.index({ memberId: 1, createdAt: -1 });
// The unassigned queue: settled money with nobody's name on it, oldest first,
// because the oldest is the one most likely to have been forgotten.
TerminalPaymentSchema.index({ status: 1, memberId: 1, paidAt: 1 });

if (process.env.NODE_ENV === "development" && models.TerminalPayment) {
  delete models.TerminalPayment;
}

const TerminalPayment =
  models.TerminalPayment || model("TerminalPayment", TerminalPaymentSchema);
export default TerminalPayment;
