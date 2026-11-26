// lib/budgetEvents.ts
// Writing to the committee budget action log. Every state change in the budget
// feature calls this once, after the change itself has been written.
import BudgetEvent, { BudgetEventType } from "@/lib/models/BudgetEvent";
import logger from "@/lib/logger";

export interface BudgetEventRefs {
  reimbursementId?: any;
  entryId?: any;
  lineId?: any;
  proposalId?: any;
  packageId?: any;
  otherCommitteeId?: any;
  voteId?: any;
  memberId?: any;
}

export interface RecordBudgetEventInput {
  term: string;
  type: BudgetEventType;
  summary: string;
  committeeId?: any | null;
  budgetId?: any | null;
  actorId?: any | null;
  amountCents?: number | null;
  occurredAt?: Date;
  before?: any;
  after?: any;
  refs?: BudgetEventRefs;
  meta?: Record<string, any>;
}

function toDoc(input: RecordBudgetEventInput, now: Date) {
  return {
    term: input.term,
    type: input.type,
    summary: input.summary,
    committeeId: input.committeeId ?? null,
    budgetId: input.budgetId ?? null,
    actorId: input.actorId ?? null,
    amountCents:
      input.amountCents === undefined || input.amountCents === null
        ? null
        : Math.round(input.amountCents),
    occurredAt: input.occurredAt ?? now,
    before: input.before ?? null,
    after: input.after ?? null,
    refs: {
      reimbursementId: input.refs?.reimbursementId ?? null,
      entryId: input.refs?.entryId ?? null,
      lineId: input.refs?.lineId ?? null,
      proposalId: input.refs?.proposalId ?? null,
      packageId: input.refs?.packageId ?? null,
      otherCommitteeId: input.refs?.otherCommitteeId ?? null,
      voteId: input.refs?.voteId ?? null,
      memberId: input.refs?.memberId ?? null,
    },
    meta: input.meta ?? {},
  };
}

/// Append one line to the log. Never throws, for the same reason
/// `recordFinanceEvent` doesn't: with no transactions, "the change happened
/// but its log line is missing" is the failure we can detect and repair, so a
/// failure here is logged at error level with everything needed to rebuild it.
export async function recordBudgetEvent(
  input: RecordBudgetEventInput
): Promise<any | null> {
  try {
    return await BudgetEvent.create(toDoc(input, new Date()));
  } catch (err: any) {
    logger.error(
      { err, budgetEvent: toDoc(input, new Date()) },
      "AUDIT GAP: budget event could not be written, the underlying change did happen"
    );
    return null;
  }
}

/// Several lines from one action, such as a transfer that is logged on both
/// committees, or approval of a package creating a budget per committee.
export async function recordBudgetEvents(
  inputs: RecordBudgetEventInput[]
): Promise<number> {
  if (!inputs.length) return 0;
  const now = new Date();
  try {
    const docs = await BudgetEvent.insertMany(
      inputs.map((input) => toDoc(input, now)),
      { ordered: false }
    );
    return docs.length;
  } catch (err: any) {
    logger.error(
      { err, budgetEvents: inputs.map((input) => toDoc(input, now)) },
      "AUDIT GAP: batch of budget events could not be written"
    );
    return 0;
  }
}
