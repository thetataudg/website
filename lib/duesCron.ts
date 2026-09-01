// lib/duesCron.ts
// The nightly pass: chase who needs chasing, move plans forward, and repair the
// one invariant a database without transactions can't guarantee on its own.
//
// Four jobs, deliberately in this order. The repairs run first so the reminders
// go out against a ledger that's already correct — chasing someone for money
// their credit should have covered is worse than not chasing them at all.
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import TerminalPayment from "@/lib/models/TerminalPayment";
import FinanceEvent from "@/lib/models/FinanceEvent";
import Member from "@/lib/models/Member";
import { applyCreditToOpenCharges, creditBalancesFor } from "@/lib/credit";
import { derivePlanProgress } from "@/lib/plans";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { selectReminderCandidates, phoenixDayLabel } from "@/lib/notify/selector";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { notifyMany } from "@/lib/notify";
import { announce } from "@/lib/notify/announce";
import logger from "@/lib/logger";

export interface CronReport {
  ranAt: string;
  reminders: { sentCount: number; skippedCount: number; summary: string };
  plans: { completed: number; defaulted: number; installmentsMarkedLate: number };
  credit: { reconciled: number; appliedCents: number };
  emails: { refreshed: number; missing: number };
  unassigned: {
    count: number;
    cents: number;
    staleCount: number;
    staleCents: number;
  };
}

/// How long in-person money may sit without an owner before it is a problem
/// rather than a pending decision.
export const UNASSIGNED_STALE_DAYS = 14;

/// Count settled card money that still belongs to nobody.
///
/// Deliberately only counts. Auto-assigning would be guessing at whose money it
/// is, and a wrong guess writes real rows onto a real member's ledger. The
/// point is to make the pile visible while it is still small enough that
/// somebody remembers the event it came from.
export async function sweepUnassignedPayments(now = new Date()) {
  const rows = await TerminalPayment.find({
    memberId: null,
    purpose: { $ne: "donation" },
    status: { $in: ["succeeded", "partially_refunded"] },
  })
    .select("principalCents paidAt description")
    .lean<any[]>();

  const cutoff = new Date(now.getTime() - UNASSIGNED_STALE_DAYS * 86400000);
  const stale = rows.filter((row) => row.paidAt && new Date(row.paidAt) < cutoff);
  const sum = (list: any[]) =>
    list.reduce((total, row) => total + (Number(row.principalCents) || 0), 0);

  if (stale.length) {
    logger.warn(
      {
        staleCount: stale.length,
        staleCents: sum(stale),
        olderThanDays: UNASSIGNED_STALE_DAYS,
      },
      "In-person payments are still unassigned"
    );
  }

  return {
    count: rows.length,
    cents: sum(rows),
    staleCount: stale.length,
    staleCents: sum(stale),
  };
}

/// The invariant repair, and it is doing real work rather than belt-and-braces.
///
/// A member must never owe money and hold credit at the same time. Credit
/// auto-applies at the two moments the two can meet, but each of those is two
/// writes on a database that can't bind them together — so a process dying in
/// the middle leaves exactly this state. Nothing else would ever notice.
/// `scope` narrows the pass to specific members. Production never passes it —
/// the whole point is to sweep everybody — but it lets the checks exercise a
/// repair against test data without reaching for anyone else's ledger.
export async function reconcileCredit(actorId: any = null, scope?: any[]) {
  const filter = scope?.length ? { _id: { $in: scope } } : {};
  const members = await Member.find(filter).select("_id rollNo").lean<any[]>();
  const memberIds = members.map((member) => member._id);
  const credits = await creditBalancesFor(memberIds);

  const holders = memberIds.filter((id) => (credits.get(String(id)) ?? 0) > 0);
  if (!holders.length) return { reconciled: 0, appliedCents: 0 };

  const charges = await DuesCharge.find({
    memberId: { $in: holders },
    status: "open",
  }).lean<any[]>();
  const owing = new Set(
    charges
      .filter((charge) => balanceCentsFor(charge) > 0)
      .map((charge) => String(charge.memberId))
  );

  let reconciled = 0;
  let appliedCents = 0;
  for (const id of holders) {
    if (!owing.has(String(id))) continue;
    const result = await applyCreditToOpenCharges(id, actorId);
    if (result.appliedCents > 0) {
      reconciled += 1;
      appliedCents += result.appliedCents;
      logger.warn(
        { memberId: String(id), appliedCents: result.appliedCents },
        "Credit invariant repaired by the nightly pass — a member was owing and holding credit at once"
      );
    }
  }
  return { reconciled, appliedCents };
}

/// Walk every live plan: mark newly-missed installments, complete the ones that
/// are finished, and flag the ones that have fallen two behind.
///
/// A default is a flag for a human conversation, never an automatic penalty —
/// nothing here accelerates a balance or cancels a plan.
export async function advancePlans(now = new Date(), scope?: any[]) {
  const filter: any = { status: "active" };
  if (scope?.length) filter.memberId = { $in: scope };
  const plans = await PaymentPlan.find(filter).lean<any[]>();
  let completed = 0;
  let defaulted = 0;
  let installmentsMarkedLate = 0;
  if (!plans.length) return { completed, defaulted, installmentsMarkedLate };

  const chargeIds = plans.flatMap((plan) => plan.chargeIds ?? []);
  const charges = await DuesCharge.find({ _id: { $in: chargeIds } }).lean<any[]>();
  const chargeById = new Map(charges.map((charge) => [String(charge._id), charge]));

  for (const plan of plans) {
    const covered = (plan.chargeIds ?? [])
      .map((id: any) => chargeById.get(String(id)))
      .filter(Boolean);
    const progress = derivePlanProgress(plan, covered, now);

    // Each missed installment gets exactly one event, ever. The derivation is
    // stateless, so without this check the cron would re-announce the same miss
    // every night until it was paid.
    const alreadyLogged = await FinanceEvent.find({
      "refs.planId": plan._id,
      type: "installment_missed",
    })
      .select("meta")
      .lean<any[]>();
    const loggedSeqs = new Set(
      alreadyLogged.map((event) => Number(event?.meta?.seq)).filter(Number.isFinite)
    );

    for (const installment of progress.installments) {
      if (installment.status !== "late" || loggedSeqs.has(installment.seq)) continue;
      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: null,
        type: "installment_missed",
        amountCents: installment.remainingCents,
        summary: `Missed installment ${installment.seq} of ${progress.installments.length}, ${formatCents(installment.remainingCents)} still owed`,
        refs: { planId: plan._id },
        meta: { seq: installment.seq, dueDate: installment.dueDate },
      });
      // actorId stays null: the member should be able to see that a system
      // marked this, not a person who decided something about them.
      await announce({
        event: "installment_missed",
        memberId: plan.memberId,
        actorId: null,
        amountCents: installment.remainingCents,
        summary: `Missed installment ${installment.seq} of ${progress.installments.length}, ${formatCents(installment.remainingCents)} still owed`,
        refs: { planId: plan._id },
        member: {
          template: "installment_missed",
          context: {
            amountCents: installment.remainingCents,
            installmentSeq: installment.seq,
            installmentCount: progress.installments.length,
            dueLabel: phoenixDayLabel(
              installment.dueDate ? new Date(installment.dueDate) : null
            ),
          },
        },
      });
      installmentsMarkedLate += 1;
    }

    if (progress.isComplete) {
      await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "completed" } });
      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: null,
        type: "plan_completed",
        amountCents: plan.totalCents,
        summary: `Payment plan finished, ${formatCents(plan.totalCents)} cleared over ${progress.installments.length} installments`,
        refs: { planId: plan._id },
      });
      await announce({
        event: "plan_completed",
        memberId: plan.memberId,
        actorId: null,
        amountCents: plan.totalCents,
        summary: `Payment plan finished, ${formatCents(plan.totalCents)} cleared over ${progress.installments.length} installments`,
        refs: { planId: plan._id },
        member: {
          template: "plan_completed",
          context: { amountCents: plan.totalCents },
        },
      });
      completed += 1;
      continue;
    }

    if (progress.shouldDefault) {
      await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "defaulted" } });
      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: null,
        type: "plan_defaulted",
        amountCents: progress.amountDueNowCents,
        summary: `Payment plan flagged after ${progress.missedCount} missed installments, ${formatCents(progress.amountDueNowCents)} behind. Needs a conversation, not a penalty.`,
        refs: { planId: plan._id },
        meta: { missedCount: progress.missedCount },
      });
      await announce({
        event: "plan_defaulted",
        memberId: plan.memberId,
        actorId: null,
        amountCents: progress.amountDueNowCents,
        summary: `Payment plan flagged after ${progress.missedCount} missed installments, ${formatCents(progress.amountDueNowCents)} behind`,
        refs: { planId: plan._id },
        member: {
          template: "plan_defaulted",
          context: { amountCents: progress.amountDueNowCents },
        },
      });
      defaulted += 1;
    }
  }

  return { completed, defaulted, installmentsMarkedLate };
}

export async function runDuesCron(now = new Date()): Promise<CronReport> {
  const credit = await reconcileCredit();
  const plans = await advancePlans(now);
  const unassigned = await sweepUnassignedPayments(now);

  const selection = await selectReminderCandidates({ now, force: false });
  const emails = selection.candidates.length
    ? await ensureMemberEmails(
        selection.candidates.map((candidate) => candidate.recipient.memberId),
        now
      )
    : { refreshed: 0, missing: 0 };

  const report = selection.candidates.length
    ? await notifyMany(
        selection.candidates.map((candidate) => ({
          recipient: candidate.recipient,
          template: candidate.template,
          context: {
            firstName: candidate.recipient.firstName,
            amountCents: candidate.amountCents,
            dueLabel: phoenixDayLabel(candidate.dueDate),
            daysOverdue: candidate.daysOverdue,
            description: candidate.description,
            installmentSeq: candidate.installmentSeq,
            installmentCount: candidate.installmentCount,
          },
          amountCents: candidate.amountCents,
          refs: candidate.refs,
          // Null actor: the timeline needs to show at a glance that nobody
          // chose to send this.
          sentBy: null,
        }))
      )
    : { sentCount: 0, skippedCount: 0, summary: "Nobody needed reminding.", channels: [], recipients: [] };

  return {
    ranAt: now.toISOString(),
    reminders: {
      sentCount: report.sentCount,
      skippedCount: report.skippedCount,
      summary: report.summary,
    },
    plans,
    credit,
    emails,
    unassigned,
  };
}

