// lib/financeEvents.ts
// Writing to a member's financial history. Everything that moves money, or
// nags someone about money, lands here.
import FinanceEvent, { FinanceEventType } from "@/lib/models/FinanceEvent";
import logger from "@/lib/logger";

export interface FinanceEventRefs {
  chargeId?: any;
  planId?: any;
  reimbursementId?: any;
  submissionId?: any;
  creditEntryId?: any;
  paymentId?: any;
  terminalPaymentId?: any;
  donationId?: any;
}

export interface RecordFinanceEventInput {
  memberId: any;
  actorId?: any | null;
  type: FinanceEventType;
  summary: string;
  amountCents?: number | null;
  occurredAt?: Date;
  channel?: string;
  refs?: FinanceEventRefs;
  meta?: Record<string, any>;
}

/// Money as a person would write it: `$250`, `$83.34`, `-$150`.
///
/// Summaries are frozen at write time, so this runs once per event and the
/// string it produces outlives every later edit to the underlying charge.
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body =
    remainder === 0
      ? `$${dollars.toLocaleString("en-US")}`
      : `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/// Append one line to a member's history.
///
/// This deliberately never throws. The database is a standalone mongod, so
/// there are no multi-document transactions to bind the event to the change it
/// describes — and given the choice between "the payment silently didn't
/// record" and "the payment recorded but the audit line is missing", the second
/// is the one you can detect and repair. A failure here is logged at error
/// level with everything needed to reconstruct the row by hand.
export async function recordFinanceEvent(
  input: RecordFinanceEventInput
): Promise<any | null> {
  try {
    const event = await FinanceEvent.create({
      memberId: input.memberId,
      actorId: input.actorId ?? null,
      type: input.type,
      summary: input.summary,
      amountCents:
        input.amountCents === undefined || input.amountCents === null
          ? null
          : Math.round(input.amountCents),
      occurredAt: input.occurredAt ?? new Date(),
      channel: input.channel ?? "",
      refs: {
        chargeId: input.refs?.chargeId ?? null,
        planId: input.refs?.planId ?? null,
        reimbursementId: input.refs?.reimbursementId ?? null,
        submissionId: input.refs?.submissionId ?? null,
        creditEntryId: input.refs?.creditEntryId ?? null,
        paymentId: input.refs?.paymentId ?? null,
        terminalPaymentId: input.refs?.terminalPaymentId ?? null,
        donationId: input.refs?.donationId ?? null,
      },
      meta: input.meta ?? {},
    });
    return event;
  } catch (err: any) {
    logger.error(
      {
        err,
        financeEvent: {
          memberId: String(input.memberId),
          actorId: input.actorId ? String(input.actorId) : null,
          type: input.type,
          summary: input.summary,
          amountCents: input.amountCents ?? null,
          refs: input.refs ?? {},
        },
      },
      "AUDIT GAP: finance event could not be written — the underlying change did happen"
    );
    return null;
  }
}

/// Bulk version for batch operations, where writing sixty events one await at a
/// time would triple the wall time of "assign dues to everyone".
export async function recordFinanceEvents(
  inputs: RecordFinanceEventInput[]
): Promise<number> {
  if (!inputs.length) return 0;
  const now = new Date();
  try {
    const docs = await FinanceEvent.insertMany(
      inputs.map((input) => ({
        memberId: input.memberId,
        actorId: input.actorId ?? null,
        type: input.type,
        summary: input.summary,
        amountCents:
          input.amountCents === undefined || input.amountCents === null
            ? null
            : Math.round(input.amountCents),
        occurredAt: input.occurredAt ?? now,
        channel: input.channel ?? "",
        refs: {
          chargeId: input.refs?.chargeId ?? null,
          planId: input.refs?.planId ?? null,
          reimbursementId: input.refs?.reimbursementId ?? null,
          submissionId: input.refs?.submissionId ?? null,
          creditEntryId: input.refs?.creditEntryId ?? null,
          paymentId: input.refs?.paymentId ?? null,
          terminalPaymentId: input.refs?.terminalPaymentId ?? null,
          donationId: input.refs?.donationId ?? null,
        },
        meta: input.meta ?? {},
      })),
      // One bad row shouldn't cost the other fifty-nine their history.
      { ordered: false }
    );
    return docs.length;
  } catch (err: any) {
    logger.error(
      { err, count: inputs.length, types: Array.from(new Set(inputs.map((i) => i.type))) },
      "AUDIT GAP: batch of finance events could not be written"
    );
    return 0;
  }
}
