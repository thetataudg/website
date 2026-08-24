// lib/models/PaymentSubmission.ts
import mongoose, { Schema, model, models } from "mongoose";

/// A member's claim that they paid, before an officer confirms it.
///
/// This is the first thing a member ever writes toward their own balance, and
/// it deliberately isn't the balance itself: members write claims, officers
/// turn claims into ledger entries. That separation is what lets members
/// participate without making `DuesCharge` untrustworthy.
const PaymentSubmissionSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    chargeId: {
      type: Schema.Types.ObjectId,
      ref: "DuesCharge",
      required: true,
      index: true,
    },
    /// Set when this settles one installment of an approved plan, so the plan
    /// can be advanced without guessing which month the money was for.
    planId: { type: Schema.Types.ObjectId, ref: "PaymentPlan", default: null },
    planSeq: { type: Number, default: null },

    amountCents: { type: Number, required: true, min: 1 },
    method: {
      type: String,
      enum: ["cash", "venmo", "zelle", "check", "other"],
      default: "other",
    },
    /// "@vinny-m", a check number, "handed it to Marcus at chapter" — whatever
    /// lets a treasurer find the money on their end.
    reference: { type: String, default: "" },
    proofUrl: { type: String, default: "" },

    /// When the member says the money moved. This is the date every
    /// punctuality question is asked of — never `reviewedAt`.
    paidOn: { type: Date, required: true },
    submittedAt: { type: Date, default: () => new Date() },

    status: {
      type: String,
      // "withdrawn" is the member taking their own claim back before anyone
      // answered it. The row stays so the trail still shows they reported and
      // then thought better of it; every pending filter excludes it for free.
      enum: ["pending", "verified", "rejected", "withdrawn"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    /// When an officer got to it. Useful for measuring how far behind the
    /// approval queue is running; never used to decide whether a member was
    /// late.
    reviewedAt: { type: Date, default: null },
    /// Required on rejection, and shown to the member. A rejected claim the
    /// member can't see the reason for is how this feature loses their trust.
    reviewNote: { type: String, default: "" },
    /// The `payments[]` subdocument this became, once verified.
    resultPaymentId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// The two reads that matter: this member's claims, and the approval queue.
PaymentSubmissionSchema.index({ memberId: 1, createdAt: -1 });
PaymentSubmissionSchema.index({ status: 1, submittedAt: 1 });

if (process.env.NODE_ENV === "development" && models.PaymentSubmission) {
  delete models.PaymentSubmission;
}

const PaymentSubmission =
  models.PaymentSubmission || model("PaymentSubmission", PaymentSubmissionSchema);
export default PaymentSubmission;
