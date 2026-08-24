// lib/financeHistory.ts
// A member's financial history, and the handful of numbers a treasurer
// actually asks about.
//
// Everything here is read-only and derived. `FinanceEvent.summary` was rendered
// once at write time and is never recomputed — if a $250 charge was later
// amended to $200, the timeline still says $250, because that's what was true
// in the moment. Rendering summaries live from current data would quietly
// rewrite the past, which is the one thing an audit trail must not do.
import FinanceEvent from "@/lib/models/FinanceEvent";
import DuesCharge, { paidCentsFor } from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { creditBalanceCents } from "@/lib/credit";
import { parseSemesterName, getDefaultSemesterRange } from "@/lib/gem";

export interface TimelineEntryDTO {
  _id: string;
  type: string;
  summary: string;
  amountCents: number | null;
  occurredAt: string | null;
  /// Null means the system did it — a cron run, or an automatic credit
  /// application. A treasurer reading the timeline needs to tell those apart
  /// from something a person chose to do.
  actor: { rollNo: string; name: string } | null;
  channel: string;
  refs: Record<string, string | null>;
}

export interface FinanceStatsDTO {
  timesRemindedThisTerm: number;
  /// Assignment to settlement, in whole days, averaged over charges that were
  /// actually paid off. Null when nothing has been settled yet — a zero here
  /// would read as "pays instantly", which is the opposite of the truth.
  averageDaysToPayCharge: number | null;
  installmentsMissed: number;
  lifetimePaidCents: number;
  creditHeldCents: number;
  /// How long the member waits for an officer to confirm a payment. Median
  /// rather than mean, because one claim forgotten for a month shouldn't make
  /// a responsive treasurer look slow — or hide a slow one behind a couple of
  /// quick approvals.
  medianVerificationDays: number | null;
  submissionsFiled: number;
  submissionsRejected: number;
  /// Plans are scoped to charges, not to members, so a member can have run
  /// several. Counted by outcome, because "asked for three plans and finished
  /// all three" and "asked for three and defaulted on two" are the same number
  /// of plans and completely different members.
  plansCompleted: number;
  plansLive: number;
  plansDefaulted: number;
}

export interface FinanceHistoryDTO {
  member: { rollNo: string; name: string };
  term: string;
  stats: FinanceStatsDTO;
  timeline: TimelineEntryDTO[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

/// The whole picture for one member.
export async function financeHistoryFor(
  member: any,
  options: { term?: string; limit?: number } = {}
): Promise<FinanceHistoryDTO> {
  const termName = options.term || getDefaultSemesterRange().name;
  const range = parseSemesterName(termName) ?? getDefaultSemesterRange();
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));

  const [events, charges, submissions, creditCents] = await Promise.all([
    FinanceEvent.find({ memberId: member._id })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .populate("actorId", "rollNo fName lName")
      .lean<any[]>(),
    DuesCharge.find({ memberId: member._id }).lean<any[]>(),
    PaymentSubmission.find({ memberId: member._id }).lean<any[]>(),
    creditBalanceCents(member._id),
  ]);

  const plans = await PaymentPlan.find({ memberId: member._id })
    .select("status")
    .lean<any[]>();

  // Counted over the whole history rather than the page, so the numbers don't
  // change when someone scrolls.
  const [remindersThisTerm, missedInstallments] = await Promise.all([
    FinanceEvent.countDocuments({
      memberId: member._id,
      type: "reminder_sent",
      occurredAt: { $gte: range.startDate, $lte: range.endDate },
    }),
    FinanceEvent.countDocuments({
      memberId: member._id,
      type: "installment_missed",
    }),
  ]);

  // Voided charges are excluded everywhere below: a void means the charge
  // should never have existed, so counting its money would inflate what the
  // member has actually paid.
  const live = charges.filter((charge) => charge.status !== "void");
  const lifetimePaidCents = live.reduce(
    (sum, charge) => sum + paidCentsFor(charge),
    0
  );

  const settledDurations: number[] = [];
  for (const charge of live) {
    const owed = Number(charge.amountCents) || 0;
    if (owed <= 0 || paidCentsFor(charge) < owed) continue;
    const assignedAt = charge.createdAt ? new Date(charge.createdAt) : null;
    // The date the money moved, not the date an officer got to it — the same
    // rule punctuality is judged on.
    const settledOn = (charge.payments ?? [])
      .map((payment: any) => (payment?.paidOn ? new Date(payment.paidOn).getTime() : 0))
      .filter((time: number) => time > 0)
      .sort((a: number, b: number) => b - a)[0];
    if (!assignedAt || !settledOn) continue;
    settledDurations.push(wholeDaysBetween(assignedAt, new Date(settledOn)));
  }
  const averageDaysToPayCharge = settledDurations.length
    ? Math.round(
        settledDurations.reduce((sum, days) => sum + days, 0) /
          settledDurations.length
      )
    : null;

  // The paidOn/recordedAt split makes this free, and a queue quietly running
  // eight days behind is something the chapter should be able to see.
  const verificationDays = submissions
    .filter((submission) => submission.status === "verified" && submission.reviewedAt && submission.submittedAt)
    .map((submission) =>
      wholeDaysBetween(new Date(submission.submittedAt), new Date(submission.reviewedAt))
    );

  return {
    member: {
      rollNo: member.rollNo ?? "",
      name: `${member.fName ?? ""} ${member.lName ?? ""}`.trim(),
    },
    term: termName,
    stats: {
      timesRemindedThisTerm: remindersThisTerm,
      averageDaysToPayCharge,
      installmentsMissed: missedInstallments,
      lifetimePaidCents,
      creditHeldCents: creditCents,
      medianVerificationDays: median(verificationDays),
      submissionsFiled: submissions.length,
      submissionsRejected: submissions.filter((s) => s.status === "rejected").length,
      plansCompleted: plans.filter((p) => p.status === "completed").length,
      plansLive: plans.filter((p) => p.status === "active" || p.status === "pending").length,
      plansDefaulted: plans.filter((p) => p.status === "defaulted").length,
    },
    timeline: events.map(serializeEvent),
  };
}

export function serializeEvent(event: any): TimelineEntryDTO {
  const actor = event?.actorId;
  return {
    _id: event?._id?.toString?.() ?? "",
    type: event?.type ?? "",
    summary: event?.summary ?? "",
    amountCents:
      event?.amountCents === null || event?.amountCents === undefined
        ? null
        : Number(event.amountCents),
    occurredAt: event?.occurredAt ? new Date(event.occurredAt).toISOString() : null,
    actor:
      actor && typeof actor === "object" && actor.rollNo
        ? {
            rollNo: actor.rollNo,
            name: `${actor.fName ?? ""} ${actor.lName ?? ""}`.trim(),
          }
        : null,
    channel: event?.channel ?? "",
    refs: {
      chargeId: event?.refs?.chargeId?.toString?.() ?? null,
      planId: event?.refs?.planId?.toString?.() ?? null,
      reimbursementId: event?.refs?.reimbursementId?.toString?.() ?? null,
      submissionId: event?.refs?.submissionId?.toString?.() ?? null,
    },
  };
}

/// Chapter-wide numbers for the term-end report.
export interface AuditExportRow {
  rollNo: string;
  name: string;
  assignedCents: number;
  paidCents: number;
  balanceCents: number;
  creditCents: number;
  status: string;
}

export interface AuditExportDTO {
  term: string;
  generatedAt: string;
  rows: AuditExportRow[];
  totals: {
    assignedCents: number;
    paidCents: number;
    outstandingCents: number;
    creditOwedCents: number;
    memberCount: number;
    settledCount: number;
  };
  /// Every event of the term, in order, so the PDF can carry the ledger itself
  /// rather than just the summary a spreadsheet would give you.
  timeline: TimelineEntryDTO[];
}
