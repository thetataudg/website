// lib/plans.ts
// Payment plans: what a member may propose, what schedule that produces, and
// how far along one is.
//
// The whole module is built around one decision — an installment is never
// marked paid, it is *worked out*. See `derivePlanProgress` for why.
import { DateTime } from "luxon";
import PaymentPlan from "@/lib/models/PaymentPlan";
// The calculator lives in its own import-free module so the request screen can
// draw exactly the schedule this file will build. See lib/planMath.ts.
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  MIN_INSTALLMENT_CENTS,
  ScheduledInstallment,
  addMonthsUtc,
  buildSchedule,
  maxInstallmentsFor,
  planIsPossible,
  splitEvenly,
  toCalendarDay,
} from "@/lib/planMath";
import DuesCharge, { balanceCentsFor, paidCentsFor } from "@/lib/models/DuesCharge";
import { arizonaDueDeadline, isPastDueInArizona } from "@/lib/dues";

/// The date a plan proposal is judged against: the earliest deadline among the
/// charges it would cover.
///
/// If the member is already past one of them, that charge is late whatever they
/// propose now — so the earliest date is the binding one.
export function anchorDueDateFor(charges: any[]): Date | null {
  const dates = charges
    .filter((charge) => balanceCentsFor(charge) > 0 && charge?.dueDate)
    .map((charge) => new Date(charge.dueDate).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  return dates.length ? new Date(dates[0]) : null;
}

/// Can a plan still be proposed against these charges?
///
/// The due date is not a limit on when installments land — it's a limit on when
/// you can ask. Past Phoenix end-of-day, the answer is no and the full amount is
/// simply late.
export function proposalWindowOpen(charges: any[], now = new Date()): boolean {
  const anchor = anchorDueDateFor(charges);
  // A charge with no due date at all can't have a missed deadline.
  if (!anchor) return true;
  return !isPastDueInArizona(anchor, now);
}

export type InstallmentStatus = "upcoming" | "due" | "paid" | "late" | "waived";

export interface InstallmentView {
  seq: number;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: InstallmentStatus;
}

export interface PlanProgress {
  installments: InstallmentView[];
  /// Money counted against this plan, ignoring anything paid before it started.
  paidCents: number;
  remainingCents: number;
  /// The installment the member is working on, or null once they're done.
  currentSeq: number | null;
  /// What to put on screen as the headline number.
  amountDueNowCents: number;
  dueNowDate: string | null;
  /// Past-due installments still short. Contiguous by construction, since money
  /// fills the schedule in order — so this is also the consecutive-miss count.
  missedCount: number;
  isComplete: boolean;
  /// Two consecutive misses is the threshold for a human conversation.
  shouldDefault: boolean;
}

/// Where a plan actually stands, worked out from the charges it covers.
///
/// Nothing writes a paid flag onto an installment. The plan's progress is
/// `sum(paid on the covered charges) − baselinePaidCents`, poured into the
/// installments in order. That single decision is what makes a member's claim,
/// a treasurer's manual entry and an automatic credit application all advance
/// the plan without any of those three code paths knowing plans exist — and it
/// means there is no stored field that can drift out of step with the ledger on
/// a database that can't write two documents atomically.
export function derivePlanProgress(
  plan: any,
  charges: any[],
  now = new Date()
): PlanProgress {
  const covered = filterCovered(plan, charges);
  const totalCents = Math.round(Number(plan?.totalCents) || 0);
  const baseline = Math.round(Number(plan?.baselinePaidCents) || 0);

  // Voided charges are excluded: a void means the charge should never have
  // existed, so money posted against it isn't progress on this plan.
  const paidOnCharges = covered
    .filter((charge) => charge?.status !== "void")
    .reduce((sum, charge) => sum + paidCentsFor(charge), 0);
  const outstanding = covered.reduce(
    (sum, charge) => sum + balanceCentsFor(charge),
    0
  );

  let progress = Math.max(0, paidOnCharges - baseline);
  const paidCents = Math.min(progress, totalCents);

  // A waiver zeroes what's left owed, so the plan has nothing further to
  // collect however little of it was actually paid.
  const settledByCharges = covered.length > 0 && outstanding <= 0;

  const raw: any[] = Array.isArray(plan?.installments) ? plan.installments : [];
  const installments: InstallmentView[] = [];
  let currentSeq: number | null = null;
  let missedCount = 0;
  let arrearsCents = 0;
  let nextDueCents = 0;
  let dueNowDate: string | null = null;

  for (const row of raw) {
    const amountCents = Math.round(Number(row?.amountCents) || 0);
    const applied = Math.min(progress, amountCents);
    progress -= applied;
    const remaining = Math.max(0, amountCents - applied);
    const dueDate = row?.dueDate ? new Date(row.dueDate) : null;

    let status: InstallmentStatus;
    if (remaining <= 0) {
      status = "paid";
    } else if (settledByCharges) {
      status = "waived";
    } else if (isPastDueInArizona(dueDate, now)) {
      status = "late";
      missedCount += 1;
      arrearsCents += remaining;
    } else if (currentSeq === null) {
      status = "due";
    } else {
      status = "upcoming";
    }

    if (remaining > 0 && !settledByCharges && currentSeq === null) {
      currentSeq = Number(row?.seq) || installments.length + 1;
      dueNowDate = dueDate ? dueDate.toISOString() : null;
      if (status !== "late") nextDueCents = remaining;
    }

    installments.push({
      seq: Number(row?.seq) || installments.length + 1,
      dueDate: dueDate ? dueDate.toISOString() : null,
      amountCents,
      paidCents: applied,
      remainingCents: remaining,
      status,
    });
  }

  const isComplete = settledByCharges || paidCents >= totalCents;
  // Arrears accumulate: a member two installments behind is asked for both, not
  // shown the older one and quietly chased for the other.
  const amountDueNowCents = isComplete ? 0 : arrearsCents + nextDueCents;

  return {
    installments,
    paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    currentSeq: isComplete ? null : currentSeq,
    amountDueNowCents,
    dueNowDate: isComplete ? null : dueNowDate,
    missedCount,
    isComplete,
    shouldDefault: !isComplete && missedCount >= 2,
  };
}

function filterCovered(plan: any, charges: any[]) {
  const ids = Array.isArray(plan?.chargeIds)
    ? plan.chargeIds.map((id: any) => String(id))
    : [];
  if (!ids.length) return charges ?? [];
  const wanted = new Set(ids);
  return (charges ?? []).filter((charge) => wanted.has(String(charge?._id)));
}

/// A plan only drives the member's headline number while it's live. A pending
/// proposal suppresses overdue and reminders but doesn't replace the balance —
/// nothing has been agreed yet.
export function planIsActive(plan: any): boolean {
  return plan?.status === "active";
}

/// The terminal stored statuses. A plan in one of these is history whatever the
/// ledger says.
const CLOSED_STATUSES = new Set(["completed", "cancelled", "denied", "defaulted"]);

/// Is this plan done collecting?
///
/// Completion is *derived* rather than read off the stored status, for the same
/// reason installment progress is: the nightly cron is what writes `completed`
/// and its `plan_completed` event, so a plan settled by this morning's payment
/// would otherwise keep presenting itself as the member's live plan until 9am
/// tomorrow. The stored status remains the durable record; this is what the
/// screens read so a finished plan archives itself the moment it's paid.
export function planIsFinished(
  plan: any,
  charges: any[],
  now = new Date()
): boolean {
  if (CLOSED_STATUSES.has(plan?.status)) return true;
  // A proposal nobody has answered isn't finished, however the money looks.
  if (plan?.status === "pending") return false;
  return derivePlanProgress(plan, charges, now).isComplete;
}

/// Split a member's plans into the ones still doing work and the ones to
/// archive. `charges` is the member's whole set; each plan narrows it itself.
export function partitionPlans(
  plans: any[],
  charges: any[],
  now = new Date()
): { live: any[]; finished: any[] } {
  const live: any[] = [];
  const finished: any[] = [];
  for (const plan of plans ?? []) {
    (planIsFinished(plan, charges, now) ? finished : live).push(plan);
  }
  return { live, finished };
}

/// Every charge id currently spoken for by a plan that hasn't finished.
///
/// This is the conflict set: a member may run several plans at once, but no
/// charge may sit under two of them, or two schedules would be claiming the
/// same money.
export function chargeIdsUnderLivePlans(
  plans: any[],
  charges: any[],
  now = new Date()
): Set<string> {
  const ids = new Set<string>();
  for (const plan of plans ?? []) {
    if (planIsFinished(plan, charges, now)) continue;
    for (const id of plan?.chargeIds ?? []) ids.add(String(id));
  }
  return ids;
}

export interface PaymentPlanDTO {
  _id: string;
  memberId: string;
  term: string;
  status: string;
  chargeIds: string[];
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  installmentCount: number;
  installments: InstallmentView[];
  currentSeq: number | null;
  amountDueNowCents: number;
  dueNowDate: string | null;
  missedCount: number;
  proposedAt: string | null;
  proposedAgainstDueDate: string | null;
  requestNote: string;
  reviewedAt: string | null;
  reviewNote: string;
  graceUntil: string | null;
  createdAt: string | null;
}

export function serializePlan(
  plan: any,
  charges: any[] = [],
  now = new Date()
): PaymentPlanDTO {
  const progress = derivePlanProgress(plan, charges, now);
  return {
    _id: plan?._id?.toString?.() ?? "",
    memberId: plan?.memberId?.toString?.() ?? "",
    term: plan?.term ?? "",
    status: plan?.status ?? "pending",
    chargeIds: (plan?.chargeIds ?? []).map((id: any) => String(id)),
    totalCents: Math.round(Number(plan?.totalCents) || 0),
    paidCents: progress.paidCents,
    remainingCents: progress.remainingCents,
    installmentCount: progress.installments.length,
    installments: progress.installments,
    currentSeq: progress.currentSeq,
    amountDueNowCents: progress.amountDueNowCents,
    dueNowDate: progress.dueNowDate,
    missedCount: progress.missedCount,
    proposedAt: plan?.proposedAt ? new Date(plan.proposedAt).toISOString() : null,
    proposedAgainstDueDate: plan?.proposedAgainstDueDate
      ? new Date(plan.proposedAgainstDueDate).toISOString()
      : null,
    requestNote: plan?.requestNote ?? "",
    reviewedAt: plan?.reviewedAt ? new Date(plan.reviewedAt).toISOString() : null,
    reviewNote: plan?.reviewNote ?? "",
    graceUntil: plan?.graceUntil ? new Date(plan.graceUntil).toISOString() : null,
    createdAt: plan?.createdAt ? new Date(plan.createdAt).toISOString() : null,
  };
}

/// What the member's screens should lead with: this month's installment when a
/// plan is running, the whole balance otherwise.
export function currentDue(
  plan: any | null,
  charges: any[],
  fallbackBalanceCents: number,
  fallbackDueDate: string | null,
  now = new Date()
): { amountDueNowCents: number; dueNowDate: string | null } {
  if (!plan || !planIsActive(plan)) {
    return {
      amountDueNowCents: fallbackBalanceCents,
      dueNowDate: fallbackDueDate,
    };
  }
  const progress = derivePlanProgress(plan, charges, now);
  if (progress.isComplete) {
    return {
      amountDueNowCents: fallbackBalanceCents,
      dueNowDate: fallbackDueDate,
    };
  }
  return {
    amountDueNowCents: progress.amountDueNowCents,
    dueNowDate: progress.dueNowDate,
  };
}

/// The headline number when a member is running more than one plan.
///
/// A member can hold several plans at once — one per charge they asked to
/// spread out — alongside charges they never put on a plan at all. What they
/// owe *right now* is therefore the sum of what each live plan is asking for
/// this month plus the full balance of everything no plan covers. Anything less
/// would quietly hide a debt; anything more would chase money they've already
/// agreed terms on.
export function currentDueAcross(
  plans: any[],
  charges: any[],
  fallbackDueDate: string | null,
  now = new Date()
): { amountDueNowCents: number; dueNowDate: string | null } {
  const covered = new Set<string>();
  let planDemand = 0;
  const dates: number[] = [];

  for (const plan of plans ?? []) {
    if (!planIsActive(plan)) continue;
    const progress = derivePlanProgress(plan, charges, now);
    // A finished plan is spent — but its charges stay covered, so a settled
    // charge can't fall through and be counted again at full balance.
    for (const id of plan?.chargeIds ?? []) covered.add(String(id));
    if (progress.isComplete) continue;
    planDemand += progress.amountDueNowCents;
    if (progress.dueNowDate) dates.push(new Date(progress.dueNowDate).getTime());
  }

  // A pending proposal hasn't been agreed to, so its charges still read at full
  // balance — which is exactly what `currentDue` does for the single-plan case.
  let uncovered = 0;
  for (const charge of charges ?? []) {
    if (charge?.status === "void") continue;
    if (covered.has(String(charge?._id))) continue;
    uncovered += balanceCentsFor(charge);
    if (balanceCentsFor(charge) > 0 && charge?.dueDate) {
      dates.push(new Date(charge.dueDate).getTime());
    }
  }

  const amountDueNowCents = planDemand + uncovered;
  if (amountDueNowCents <= 0) {
    return { amountDueNowCents: 0, dueNowDate: null };
  }
  // The soonest thing they have to act on is the date worth showing.
  const soonest = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  return { amountDueNowCents, dueNowDate: soonest ?? fallbackDueDate };
}

/// The five days a denied member gets before the full amount reads as late.
/// They filed in good faith before the deadline; the denial is news to them.
export const DENIAL_GRACE_DAYS = 5;

export function denialGraceUntil(now = new Date()): Date {
  return DateTime.fromJSDate(now)
    .setZone("America/Phoenix")
    .plus({ days: DENIAL_GRACE_DAYS })
    .endOf("day")
    .toJSDate();
}

/// A denied plan doesn't make its charges instantly overdue — the grace window
/// holds them off, and only for as long as it lasts.
export function graceWindowOpen(plan: any, now = new Date()): boolean {
  if (plan?.status !== "denied" || !plan?.graceUntil) return false;
  return now <= new Date(plan.graceUntil);
}

// --- database helpers ------------------------------------------------------

/// Every plan of a member's that is still doing work — agreed or awaiting an
/// answer, and not yet paid off.
///
/// Plural by design: a member who put a $200 dues charge on a plan and then
/// picked up a $500 trip deposit can run a second plan for the second charge.
/// The charges each plan covers are disjoint (see `chargeIdsUnderLivePlans`),
/// so the schedules never argue over the same money.
export async function livePlansFor(memberId: any): Promise<any[]> {
  const plans = await PaymentPlan.find({
    memberId,
    status: { $in: ["active", "pending"] },
  })
    .sort({ status: 1, proposedAt: -1 })
    .lean<any[]>();
  if (!plans.length) return [];

  const chargeIds = plans.flatMap((plan) => plan.chargeIds ?? []);
  const charges = chargeIds.length
    ? await DuesCharge.find({ _id: { $in: chargeIds } }).lean<any[]>()
    : [];
  return partitionPlans(plans, charges).live;
}

/// The one plan that leads a member's screens: their soonest-due live plan, or
/// the proposal they're waiting on. Kept for the single-plan callers and for
/// the `plan` field older app builds still read.
export async function currentPlanFor(memberId: any): Promise<any | null> {
  // "active" sorts before "pending", so a live plan wins over a proposal.
  return (await livePlansFor(memberId))[0] ?? null;
}

/// Which of these members have a proposal in the queue — the plan-side twin of
/// `membersAwaitingReview()`. Nothing should chase someone who has already
/// asked and is waiting on an answer.
export async function membersAwaitingPlanReview(
  memberIds: any[]
): Promise<Set<string>> {
  if (!memberIds.length) return new Set();
  const pending = await PaymentPlan.find({
    memberId: { $in: memberIds },
    status: "pending",
  })
    .select("memberId")
    .lean<any[]>();
  return new Set(
    pending.map((plan) => plan.memberId?.toString()).filter(Boolean)
  );
}

/// Live plans keyed by member, for the roster and the reminder selector.
///
/// A member maps to a *list*: several plans can run at once. Callers that want
/// one to lead with should take the first — they arrive soonest-proposed first.
/// Plans already paid off are filtered out here rather than at each call site,
/// so nothing downstream has to remember that stored `completed` lags a day.
export async function activePlansFor(
  memberIds: any[]
): Promise<Map<string, any[]>> {
  if (!memberIds.length) return new Map();
  const plans = await PaymentPlan.find({
    memberId: { $in: memberIds },
    status: "active",
  })
    .sort({ proposedAt: 1 })
    .lean<any[]>();
  if (!plans.length) return new Map();

  const chargeIds = plans.flatMap((plan) => plan.chargeIds ?? []);
  const charges = chargeIds.length
    ? await DuesCharge.find({ _id: { $in: chargeIds } }).lean<any[]>()
    : [];

  const byMember = new Map<string, any[]>();
  for (const plan of partitionPlans(plans, charges).live) {
    const key = plan.memberId?.toString();
    if (!key) continue;
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key)!.push(plan);
  }
  return byMember;
}

export {
  arizonaDueDeadline,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  MIN_INSTALLMENT_CENTS,
  addMonthsUtc,
  buildSchedule,
  maxInstallmentsFor,
  planIsPossible,
  splitEvenly,
  toCalendarDay,
};
export type { ScheduledInstallment };
