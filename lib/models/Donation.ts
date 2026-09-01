// lib/models/Donation.ts
import mongoose, { Schema, model, models } from "mongoose";

export const DONATION_STATUSES = [
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

/// Where the donor wants the money to go.
///
/// A short controlled list rather than free text, for two reasons: it makes
/// "what did we raise and for what" a query instead of a reading exercise, and
/// it stops a donor inventing a restriction the chapter has no way to honor.
/// `general` is the default and the only genuinely unrestricted option.
export const DONATION_DESIGNATIONS = [
  "general",
  "housing",
  "operations",
  "professional",
  "tools",
] as const;

/// These are the same four uses the public page lists, plus the unrestricted
/// default. Keeping the two lists identical is deliberate: a donor should never
/// be offered a fund the page did not explain, or read about a cause they then
/// cannot give to.
export const DONATION_DESIGNATION_LABELS: Record<string, string> = {
  general: "Where it's needed most",
  housing: "Housing",
  operations: "Chapter operations",
  professional: "Professional certifications",
  tools: "Tools and equipment",
};

export const DONATION_CHANNELS = ["web", "app", "terminal"] as const;

/// A gift to the chapter.
///
/// Deliberately separate from every dues model. A donation never reduces a
/// balance, never becomes credit, and never appears on a member's ledger, even
/// when the donor is a member who owes money. The reporting question it answers
/// is a different one from "who owes what".
const DonationSchema = new Schema(
  {
    /// Set when the donor was signed in. Null for an alumnus or a stranger
    /// giving through the public page, which is the common case and the whole
    /// reason this is not keyed on Member.
    donorMemberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      default: null,
      index: true,
    },
    donorName: { type: String, default: "", maxlength: 120 },
    donorEmail: { type: String, default: "", maxlength: 200 },

    amountCents: { type: Number, required: true, min: 100 },
    currency: { type: String, default: "usd" },
    designation: {
      type: String,
      enum: DONATION_DESIGNATIONS,
      default: "general",
    },
    /// Why they gave, in their words. Capped at 500 to match the Stripe
    /// metadata limit it rides along in.
    message: { type: String, default: "", maxlength: 500 },
    /// Whether they may be named in a thank-you or a newsletter. Asked once,
    /// stored, and honored.
    isAnonymous: { type: Boolean, default: false },

    channel: { type: String, enum: DONATION_CHANNELS, required: true },
    /// Set when the gift was taken in person on an officer's phone.
    terminalPaymentId: { type: Schema.Types.ObjectId, default: null },

    stripePaymentIntentId: { type: String, default: null },
    stripeChargeId: { type: String, default: null },
    status: {
      type: String,
      enum: DONATION_STATUSES,
      default: "creating",
      index: true,
    },
    failureMessage: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    refundedCents: { type: Number, default: 0, min: 0 },
    disputeId: { type: String, default: null },
    disputeStatus: { type: String, default: null },

    /// Whether a human has thanked them yet. The single piece of state a
    /// donation program actually lives or dies on.
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    receiptSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DonationSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripePaymentIntentId: { $type: "string" } },
  }
);
DonationSchema.index({ status: 1, paidAt: -1 });
DonationSchema.index({ designation: 1, paidAt: -1 });

if (process.env.NODE_ENV === "development" && models.Donation) {
  delete models.Donation;
}

const Donation = models.Donation || model("Donation", DonationSchema);
export default Donation;
