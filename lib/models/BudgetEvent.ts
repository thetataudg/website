// lib/models/BudgetEvent.ts
import mongoose, { Schema, model, models } from "mongoose";

/// The committee budget action log.
///
/// The committee-scoped twin of `FinanceEvent`. That one requires a member,
/// and most of what happens to a budget (an allocation, a transfer, a vote)
/// belongs to a committee instead. Anything here that also touches one
/// person's money writes a `FinanceEvent` too, so their own history stays
/// complete.
///
/// Append-only: nothing updates or deletes these.
export const BUDGET_EVENT_TYPES = [
  // The term cycle
  "term_opened",
  "proposals_closed",
  "proposals_reopened",
  "proposal_saved",
  "proposal_submitted",
  "proposal_returned",
  "proposal_edited",
  "proposal_resubmitted",
  "chapter_costs_set",
  "package_created",
  "vote_opened",
  "vote_closed",
  "vote_cancelled",
  "package_cancelled",
  "vote_recorded",
  "package_approved",
  "package_rejected",
  "dues_suggested",
  "dues_amount_set",
  "dues_assigned",
  "amendment_proposed",
  "amendment_approved",
  // Treasurer money tools
  "budget_created",
  "budget_allocated",
  "budget_adjusted",
  "line_added",
  "line_renamed",
  "line_archived",
  "lines_reallocated",
  "transfer_out",
  "transfer_in",
  "income_recorded",
  "direct_spend_recorded",
  "entry_reversed",
  // Requests
  "claim_submitted",
  "claim_edited",
  "claim_resubmitted",
  "claim_withdrawn",
  "claim_approved",
  "claim_partially_approved",
  "claim_denied",
  "claim_returned",
  "over_budget_override",
  "expense_retagged",
  "receipt_added",
  "preapproval_requested",
  "preapproval_approved",
  "preapproval_denied",
  "preapproval_released",
  "payout_recorded",
  "payout_as_credit",
  // Close
  "budget_closed",
  "rollover_carried",
  "rollover_returned",
  // System
  "threshold_crossed",
  "audit_gap_repaired",
] as const;

export type BudgetEventType = (typeof BUDGET_EVENT_TYPES)[number];

const BudgetEventSchema = new Schema(
  {
    /// Null for chapter-wide actions (opening a term, a package vote).
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    budgetId: { type: Schema.Types.ObjectId, ref: "CommitteeBudget", default: null },
    term: { type: String, required: true },
    /// Null means the system did it.
    actorId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    type: { type: String, enum: BUDGET_EVENT_TYPES, required: true },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    amountCents: { type: Number, default: null },
    /// Rendered once at write time and never recomputed.
    summary: { type: String, required: true },
    /// The fields that changed, as they were and as they became.
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    refs: {
      reimbursementId: { type: Schema.Types.ObjectId, default: null },
      entryId: { type: Schema.Types.ObjectId, default: null },
      lineId: { type: Schema.Types.ObjectId, default: null },
      proposalId: { type: Schema.Types.ObjectId, default: null },
      packageId: { type: Schema.Types.ObjectId, default: null },
      otherCommitteeId: { type: Schema.Types.ObjectId, default: null },
      voteId: { type: Schema.Types.ObjectId, default: null },
      memberId: { type: Schema.Types.ObjectId, default: null },
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// A head reading their committee's log, newest first.
BudgetEventSchema.index({ committeeId: 1, occurredAt: -1 });
// The treasurer's chapter-wide log and the term export.
BudgetEventSchema.index({ term: 1, occurredAt: -1 });

if (process.env.NODE_ENV === "development" && models.BudgetEvent) {
  delete models.BudgetEvent;
}

const BudgetEvent = models.BudgetEvent || model("BudgetEvent", BudgetEventSchema);
export default BudgetEvent;
