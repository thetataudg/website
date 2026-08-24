// lib/notify/selector.ts
// Who is actually worth reminding.
//
// Every exclusion here is a state the member reached by doing the right thing.
// Getting chased for money while your payment sits in someone's approval queue
// is the fastest way to make people distrust the whole system, so the selector
// drops those four groups before the cooldown gate ever runs. The engine should
// only ever be chasing silence.
import { DateTime } from "luxon";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { arizonaDueDeadline } from "@/lib/dues";
import { membersAwaitingReview } from "@/lib/submissions";
import {
  activePlansFor,
  derivePlanProgress,
  graceWindowOpen,
  membersAwaitingPlanReview,
} from "@/lib/plans";
import PaymentPlan from "@/lib/models/PaymentPlan";
import type { ReminderTemplate } from "@/lib/notify/templates";
import type { Recipient } from "@/lib/notify/channels/types";

export interface Candidate {
  recipient: Recipient;
  template: ReminderTemplate;
  amountCents: number;
  dueDate: Date | null;
  daysOverdue: number;
  description: string;
  installmentSeq?: number;
  installmentCount?: number;
  refs: Record<string, any>;
}

export interface SelectionSkip {
  rollNo: string;
  name: string;
  reason: string;
}

export interface Selection {
  candidates: Candidate[];
  skipped: SelectionSkip[];
}

/// Whole calendar days between two days, in Phoenix. Never a timestamp
/// subtraction: "due in 7 days" has to mean seven sleeps, not 168 hours.
export function calendarDaysUntil(due: Date, now = new Date()): number {
  const dueDay = DateTime.fromJSDate(due, { zone: "utc" }).startOf("day");
  const today = DateTime.fromJSDate(now, { zone: ARIZONA_ZONE }).startOf("day");
  return Math.round(
    dueDay.diff(
      DateTime.fromObject(
        { year: today.year, month: today.month, day: today.day },
        { zone: "utc" }
      ),
      "days"
    ).days
  );
}

/// Which reminder, if any, today's date calls for on an unpaid charge.
///
/// Overdue repeats every three days rather than daily — often enough that
/// silence isn't an option, rarely enough that it doesn't read as harassment.
export function templateForCharge(
  dueDate: Date | null,
  now = new Date()
): { template: ReminderTemplate; daysOverdue: number } | null {
  if (!dueDate) return null;
  const days = calendarDaysUntil(dueDate, now);
  if (days === 7) return { template: "upcoming", daysOverdue: 0 };
  if (days === 1) return { template: "due_soon", daysOverdue: 0 };
  if (days === 0) return { template: "due_today", daysOverdue: 0 };
  if (days < 0) {
    const overdue = Math.abs(days);
    return overdue % 3 === 0
      ? { template: "overdue", daysOverdue: overdue }
      : null;
  }
  return null;
}

export function phoenixDayLabel(value: Date | null): string {
  if (!value) return "";
  return DateTime.fromJSDate(value, { zone: "utc" }).toFormat("LLL d");
}

/// Build the nightly list.
///
/// `force` is what the manual "Remind all" button passes: it skips the
/// calendar-day test so a treasurer can chase everyone who owes, whenever they
/// like. It does *not* skip the exclusions or the cooldown — those hold for
/// everybody, including an impatient officer.
export async function selectReminderCandidates(options: {
  now?: Date;
  force?: boolean;
  memberIds?: any[];
  term?: string;
} = {}): Promise<Selection> {
  const now = options.now ?? new Date();

  // Alumni and inactive members keep their existing charges visible but are
  // excluded from automatic chasing — graduating clears the debt from nobody's
  // records, but the chapter doesn't hound people who've left.
  const memberFilter: any = { status: "Active" };
  if (options.memberIds?.length) memberFilter._id = { $in: options.memberIds };
  const members = await Member.find(memberFilter)
    .select("_id rollNo fName lName email")
    .lean<any[]>();
  if (!members.length) return { candidates: [], skipped: [] };

  const memberIds = members.map((member) => member._id);
  const chargeFilter: any = { memberId: { $in: memberIds }, status: "open" };
  if (options.term) chargeFilter.term = options.term;

  const [charges, awaitingPayment, awaitingPlan, activePlans, deniedPlans] =
    await Promise.all([
      DuesCharge.find(chargeFilter).lean<any[]>(),
      membersAwaitingReview(memberIds),
      membersAwaitingPlanReview(memberIds),
      activePlansFor(memberIds),
      PaymentPlan.find({ memberId: { $in: memberIds }, status: "denied" }).lean<any[]>(),
    ]);

  const chargesByMember = new Map<string, any[]>();
  for (const charge of charges) {
    const key = charge.memberId?.toString();
    if (!key) continue;
    if (!chargesByMember.has(key)) chargesByMember.set(key, []);
    chargesByMember.get(key)!.push(charge);
  }

  const candidates: Candidate[] = [];
  const skipped: SelectionSkip[] = [];

  for (const member of members) {
    const key = member._id.toString();
    const name = `${member.fName} ${member.lName}`.trim();
    const note = (reason: string) => skipped.push({ rollNo: member.rollNo, name, reason });
    const recipient: Recipient = {
      memberId: member._id,
      firstName: member.fName,
      lastName: member.lName,
      rollNo: member.rollNo,
      email: member.email ?? null,
    };

    const own = chargesByMember.get(key) ?? [];
    const owed = own.reduce((sum, charge) => sum + balanceCentsFor(charge), 0);

    // A zero balance — including one reached entirely by applied credit — is
    // nothing to chase.
    if (owed <= 0) {
      continue;
    }
    if (awaitingPayment.has(key)) {
      note("payment claim in the queue");
      continue;
    }
    if (awaitingPlan.has(key)) {
      note("plan request in the queue");
      continue;
    }
    if (deniedPlans.some((plan) => String(plan.memberId) === key && graceWindowOpen(plan, now))) {
      note("inside the grace window after a denied plan");
      continue;
    }

    // A member can be running several plans at once, and can owe on charges no
    // plan covers. Split their debt in two: what they've already agreed terms
    // on, and what they haven't.
    const memberPlans = activePlans.get(key) ?? [];
    const planned = new Set<string>();
    for (const row of memberPlans) {
      for (const id of row.chargeIds ?? []) planned.add(String(id));
    }
    const uncovered = own.filter((charge) => !planned.has(String(charge._id)));
    const uncoveredOwed = uncovered.reduce(
      (sum, charge) => sum + balanceCentsFor(charge),
      0
    );

    // The most urgent plan installment across every plan they're running.
    let plan: any = null;
    let progress: ReturnType<typeof derivePlanProgress> | null = null;
    for (const row of memberPlans) {
      const rowProgress = derivePlanProgress(row, own, now);
      if (rowProgress.isComplete || rowProgress.amountDueNowCents <= 0) continue;
      const soonest = progress?.dueNowDate ? new Date(progress.dueNowDate).getTime() : Infinity;
      const candidate = rowProgress.dueNowDate ? new Date(rowProgress.dueNowDate).getTime() : Infinity;
      if (!progress || candidate < soonest) {
        plan = row;
        progress = rowProgress;
      }
    }

    if (memberPlans.length && !progress && uncoveredOwed <= 0) {
      note("plan is up to date");
      continue;
    }

    // Debt they never put on a plan is the more urgent conversation, and it's
    // the only part the general dues templates are allowed to chase — being
    // chased for a balance you already agreed terms on is exactly the thing a
    // plan is supposed to stop. Only when everything owed is under a plan does
    // the installment track take over.
    if (plan && progress && uncoveredOwed <= 0) {
      const dueNow = progress.dueNowDate ? new Date(progress.dueNowDate) : null;
      const days = dueNow ? calendarDaysUntil(dueNow, now) : 0;
      // An installment is chased on its day and every third day after; before
      // that the plan is in good standing and silence is correct.
      const dueForReminder =
        options.force || days === 0 || (days < 0 && Math.abs(days) % 3 === 0);
      if (!dueForReminder) {
        // Two different silences, and a treasurer reading the skip list needs
        // to tell them apart: someone whose next installment simply isn't due
        // yet, versus someone who is behind but was already chased within the
        // last three days. Calling the second one "in good standing" would hide
        // exactly the member worth looking at.
        note(
          days < 0
            ? `${Math.abs(days)} days behind on the plan, chased within the last 3`
            : "plan in good standing"
        );
        continue;
      }
      candidates.push({
        recipient,
        template: "installment_due",
        amountCents: progress.amountDueNowCents,
        dueDate: dueNow,
        daysOverdue: days < 0 ? Math.abs(days) : 0,
        description: "Payment plan installment",
        installmentSeq: progress.currentSeq ?? 1,
        installmentCount: progress.installments.length,
        refs: { planId: plan._id },
      });
      continue;
    }

    // The charge closest to being late is the one worth writing about — of the
    // ones no plan covers.
    const outstanding = uncovered
      .filter((charge) => balanceCentsFor(charge) > 0)
      .sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
    const lead = outstanding[0];
    const dueDate = lead?.dueDate ? new Date(lead.dueDate) : null;

    const match = templateForCharge(dueDate, now);
    if (!match && !options.force) {
      note("nothing due today");
      continue;
    }
    const template = match?.template ?? fallbackTemplate(dueDate, now);
    const daysOverdue =
      match?.daysOverdue ??
      (dueDate && arizonaDueDeadline(dueDate)! < now
        ? Math.abs(calendarDaysUntil(dueDate, now))
        : 0);

    candidates.push({
      recipient,
      template,
      amountCents: owed,
      dueDate,
      daysOverdue,
      description: lead?.description ?? "Chapter dues",
      refs: { chargeId: lead?._id ?? null },
    });
  }

  return { candidates, skipped };
}

/// What a manual "remind everyone" says to someone whose date doesn't match any
/// template today: overdue if they're late, upcoming if they aren't.
function fallbackTemplate(dueDate: Date | null, now: Date): ReminderTemplate {
  if (!dueDate) return "upcoming";
  const deadline = arizonaDueDeadline(dueDate);
  return deadline && now > deadline ? "overdue" : "upcoming";
}
