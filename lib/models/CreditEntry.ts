// lib/models/CreditEntry.ts
import mongoose, { Schema, model, models } from "mongoose";

/// Money the chapter owes a member, and money it has handed back.
///
/// Deliberately *not* a record of credit being spent on dues. When credit is
/// absorbed by a charge it lands in that charge's `payments[]` as a `credit`
/// payment, and the balance here is derived by subtracting those. Recording the
/// same event in two places is how the two places end up disagreeing — see
/// `lib/credit.ts`.
const CreditEntrySchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    /// Signed. Positive earns credit, negative gives it back.
    amountCents: { type: Number, required: true },
    type: {
      type: String,
      enum: ["earned", "paid_out", "adjustment"],
      required: true,
    },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    /// Set on `paid_out` — how the chapter actually settled up, and the proof.
    payout: {
      method: {
        type: String,
        enum: ["cash", "venmo", "zelle", "check", "other", null],
        default: null,
      },
      reference: { type: String, default: "" },
      proofUrl: { type: String, default: "" },
    },
    refs: {
      reimbursementId: { type: Schema.Types.ObjectId, default: null },
      onlinePaymentId: { type: Schema.Types.ObjectId, default: null },
    },
    actorId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

CreditEntrySchema.index({ memberId: 1, occurredAt: -1 });
CreditEntrySchema.index(
  { "refs.onlinePaymentId": 1 },
  {
    unique: true,
    partialFilterExpression: { "refs.onlinePaymentId": { $type: "objectId" } },
  }
);

if (process.env.NODE_ENV === "development" && models.CreditEntry) {
  delete models.CreditEntry;
}

const CreditEntry = models.CreditEntry || model("CreditEntry", CreditEntrySchema);
export default CreditEntry;
