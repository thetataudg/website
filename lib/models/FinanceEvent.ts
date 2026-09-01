// lib/models/FinanceEvent.ts
import mongoose, { Schema, model, models } from "mongoose";

/// One immutable line in a member's financial history.
///
/// Append-only on purpose: nothing in the app updates or deletes these. A
/// charge can be amended and a balance can move, but what happened on the day
/// it happened never changes — that's the whole point of keeping them.
export const FINANCE_EVENT_TYPES = [
  "charge_assigned",
  "charge_amended",
  "charge_waived",
  "charge_voided",
  "payment_submitted",
  "payment_verified",
  "payment_rejected",
  "payment_recorded",
  "payment_removed",
  "payment_online_succeeded",
  "payment_online_refunded",
  "payment_online_disputed",
  // In-person card payments taken with Tap to Pay on an officer's iPhone.
  "payment_terminal_succeeded",
  "payment_terminal_refunded",
  "payment_terminal_disputed",
  // Money taken before anybody knew whose it was, later given an owner. The
  // pair exists because reassignment reverses one member's ledger and credits
  // another, and both of them deserve to see that in their history.
  "payment_assigned",
  "payment_unassigned",
  "donation_received",
  "donation_refunded",
  "plan_proposed",
  "plan_approved",
  "plan_denied",
  "plan_completed",
  "plan_defaulted",
  // A proposal withdrawn before it was answered, or a live plan retired by an
  // officer. The plan status enum has always had "cancelled"; the history
  // needs to be able to say so too.
  "plan_cancelled",
  "installment_due",
  "installment_paid",
  "installment_missed",
  "reimbursement_submitted",
  "reimbursement_approved",
  "reimbursement_denied",
  "credit_applied",
  "credit_paid_out",
  "credit_adjusted",
  "reminder_sent",
] as const;

export type FinanceEventType = (typeof FINANCE_EVENT_TYPES)[number];

const FinanceEventSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    // Null means the system did it — a cron run, or an automatic credit
    // application. A treasurer reading the timeline needs to tell those apart
    // from something a person chose to do.
    actorId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    type: { type: String, enum: FINANCE_EVENT_TYPES, required: true },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    // Null when the event isn't about money (a reminder, say). Signed, so a
    // credit payout reads as negative without needing a separate field.
    amountCents: { type: Number, default: null },
    /// Rendered once, at write time, in whatever the numbers were then. Never
    /// recomputed — if a $250 charge is later amended to $200, the history has
    /// to keep saying $250 or it isn't history.
    summary: { type: String, required: true },
    // Reminders only: which channel actually delivered.
    channel: { type: String, default: "" },
    refs: {
      chargeId: { type: Schema.Types.ObjectId, default: null },
      planId: { type: Schema.Types.ObjectId, default: null },
      reimbursementId: { type: Schema.Types.ObjectId, default: null },
      submissionId: { type: Schema.Types.ObjectId, default: null },
      creditEntryId: { type: Schema.Types.ObjectId, default: null },
      paymentId: { type: Schema.Types.ObjectId, default: null },
      terminalPaymentId: { type: Schema.Types.ObjectId, default: null },
      donationId: { type: Schema.Types.ObjectId, default: null },
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// The only read pattern that matters: one member's timeline, newest first.
FinanceEventSchema.index({ memberId: 1, occurredAt: -1 });
// Secondary: "what happened to the whole chapter this term", for audit export.
FinanceEventSchema.index({ occurredAt: -1 });

if (process.env.NODE_ENV === "development" && models.FinanceEvent) {
  delete models.FinanceEvent;
}

const FinanceEvent =
  models.FinanceEvent || model("FinanceEvent", FinanceEventSchema);
export default FinanceEvent;
