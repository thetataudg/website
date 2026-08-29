// lib/models/DuesCharge.ts
import mongoose, { Schema, model, models } from "mongoose";

/// One billable line against one member — semester dues, a fine, a trip
/// deposit. Money is stored in whole cents so no rounding ever creeps in.
const DuesPaymentSchema = new Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    /// Refunds and disputes reduce what this payment settles without deleting
    /// the original audit row.
    reversedCents: { type: Number, default: 0, min: 0 },
    method: {
      type: String,
      // "credit" is an approved reimbursement being absorbed by this charge,
      // and "writeoff" is partial forgiveness — the part of a balance an
      // officer decided to stop chasing without waiving the whole charge.
      // Both are money that settled the debt without money changing hands, so
      // they belong in the same array as a Venmo payment rather than editing
      // the charge amount down and erasing what was owed.
      enum: ["cash", "venmo", "zelle", "check", "card", "ach", "credit", "writeoff", "other"],
      default: "other",
    },
    reference: { type: String, default: "" },
    /// When the money actually moved, as the member reports it and the
    /// treasurer confirms it. Every punctuality question is asked of this
    /// date — never of `recordedAt`, or a member who paid the day before the
    /// deadline and waited a week for approval reads as a week late.
    paidOn: { type: Date, default: () => new Date() },
    /// When it reached the system. Ordering and treasurer response-time stats
    /// only.
    recordedAt: { type: Date, default: () => new Date() },
    recordedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    /// The PaymentSubmission or CreditEntry this row came from, when it wasn't
    /// entered by hand.
    sourceRef: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: true }
);

const DuesChargeSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    // Semester label, matching GemRecord's — e.g. "Fall 2026".
    term: { type: String, required: true },
    description: { type: String, required: true, default: "Chapter dues" },
    category: {
      type: String,
      enum: ["dues", "fine", "event", "merch", "other"],
      default: "dues",
    },
    amountCents: { type: Number, required: true, min: 0 },
    payments: { type: [DuesPaymentSchema], default: [] },
    dueDate: { type: Date, default: null },
    // "open" is the only state that can carry a balance. Waived and void both
    // zero it out, but mean different things: waived was forgiven, void was a
    // mistake.
    status: {
      type: String,
      enum: ["open", "waived", "void"],
      default: "open",
    },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    /// Shared by every charge raised in one "assign to everyone" click, so a
    /// batch can be reviewed — or reversed — as the single action it was.
    batchId: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

DuesChargeSchema.index({ memberId: 1, term: 1 });
DuesChargeSchema.index({ batchId: 1 });

export function paidCentsFor(charge: any): number {
  if (!Array.isArray(charge?.payments)) return 0;
  return charge.payments.reduce(
    (sum: number, payment: any) =>
      sum + Math.max(
        0,
        (Number(payment?.amountCents) || 0) -
          (Number(payment?.reversedCents) || 0)
      ),
    0
  );
}

/// The part of `paidCents` that was actually money the member handed over.
///
/// Credit and write-offs settle a balance without anybody paying anything:
/// credit is the chapter's own debt being absorbed, a write-off is an officer
/// deciding to stop chasing. They are excluded here so that "has this been
/// paid?" means what a treasurer means by it. That distinction is what lets a
/// charge settled entirely by credit still be voided, which matters because
/// voiding is the one action that hands that credit back to the member.
export function memberPaidCentsFor(charge: any): number {
  if (!Array.isArray(charge?.payments)) return 0;
  return charge.payments.reduce((sum: number, payment: any) => {
    const method = String(payment?.method || "other");
    if (method === "credit" || method === "writeoff") return sum;
    return (
      sum +
      Math.max(
        0,
        (Number(payment?.amountCents) || 0) -
          (Number(payment?.reversedCents) || 0)
      )
    );
  }, 0);
}

/// What the member still owes. Anything not "open" owes nothing, and
/// overpayment never becomes a negative balance.
export function balanceCentsFor(charge: any): number {
  if (charge?.status !== "open") return 0;
  return Math.max(0, (Number(charge?.amountCents) || 0) - paidCentsFor(charge));
}

DuesChargeSchema.virtual("paidCents").get(function (this: any) {
  return paidCentsFor(this);
});

DuesChargeSchema.virtual("balanceCents").get(function (this: any) {
  return balanceCentsFor(this);
});

if (process.env.NODE_ENV === "development" && models.DuesCharge) {
  delete models.DuesCharge;
}

const DuesCharge = models.DuesCharge || model("DuesCharge", DuesChargeSchema);
export default DuesCharge;
