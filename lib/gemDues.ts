import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { arizonaDueDeadline, isPastDueInArizona } from "@/lib/dues";
import { derivePlanProgress } from "@/lib/plans";
import type { GemDuesStanding } from "@/lib/gem";

/// Which plan statuses mean "the chapter agreed to these terms".
///
/// A `pending` proposal is not one of them: nothing has been agreed, so the
/// member is still measured against the original due date. `denied` and
/// `cancelled` send them back there too. `defaulted` is its own answer — the
/// plan existed, was agreed, and was missed.
const AGREED_PLAN_STATUSES = new Set(["active", "completed"]);

function latestPaymentDate(charge: any): Date | null {
  const payments = Array.isArray(charge?.payments) ? charge.payments : [];
  let latest: Date | null = null;
  for (const payment of payments) {
    // `paidOn` is when the money moved, which is the only date punctuality can
    // fairly be asked of — see the note on the field itself.
    const paidOn = payment?.paidOn ? new Date(payment.paidOn) : null;
    if (!paidOn || Number.isNaN(paidOn.getTime())) continue;
    if (!latest || paidOn > latest) latest = paidOn;
  }
  return latest;
}

/// Was this one charge settled by its deadline?
///
/// Returns null when the charge asks nothing of the member — waived, voided,
/// or zero-amount.
function chargePunctuality(
  charge: any,
  now: Date
): "on-time" | "late" | "pending" | null {
  if (charge?.status !== "open") return null;
  if (!(Number(charge?.amountCents) > 0)) return null;

  const balance = balanceCentsFor(charge);
  if (balance > 0) {
    return isPastDueInArizona(charge?.dueDate, now) ? "late" : "pending";
  }

  const deadline = arizonaDueDeadline(charge?.dueDate);
  if (!deadline) return "on-time";
  const paidOn = latestPaymentDate(charge);
  if (!paidOn) return "on-time";
  return paidOn > deadline ? "late" : "on-time";
}

/// Article V's dues point, for a whole roster at once.
///
/// "Pay dues on time or enroll in a dues payment plan and pay that plan on
/// time" is two different questions asked of two different documents, and
/// which one applies depends on whether the chapter ever agreed to a plan. A
/// member on an agreed plan is judged by the plan's schedule and nothing else
/// — that is the entire point of being on one, and measuring them against the
/// original lump-sum due date as well would make the plan worthless.
export async function gemDuesStandingsFor(
  memberIds: string[],
  term: string,
  now = new Date()
): Promise<Map<string, GemDuesStanding>> {
  const result = new Map<string, GemDuesStanding>();
  if (!memberIds.length) return result;

  const [charges, plans] = await Promise.all([
    DuesCharge.find({ memberId: { $in: memberIds }, term, category: "dues" })
      .select("memberId amountCents payments dueDate status")
      .lean(),
    PaymentPlan.find({ memberId: { $in: memberIds }, term })
      .select("memberId term chargeIds totalCents baselinePaidCents installments status proposedAt")
      .lean(),
  ]);

  const chargesByMember = new Map<string, any[]>();
  charges.forEach((charge: any) => {
    const id = charge?.memberId?.toString();
    if (!id) return;
    const list = chargesByMember.get(id) || [];
    list.push(charge);
    chargesByMember.set(id, list);
  });

  // Newest agreed plan wins: a member can propose a replacement, and the one
  // they are actually on is the last one the chapter said yes to.
  const planByMember = new Map<string, any>();
  const defaultedByMember = new Set<string>();
  plans.forEach((plan: any) => {
    const id = plan?.memberId?.toString();
    if (!id) return;
    if (plan.status === "defaulted") {
      defaultedByMember.add(id);
      return;
    }
    if (!AGREED_PLAN_STATUSES.has(plan.status)) return;
    const current = planByMember.get(id);
    if (!current || new Date(plan.proposedAt) > new Date(current.proposedAt)) {
      planByMember.set(id, plan);
    }
  });

  for (const memberId of memberIds) {
    const memberCharges = chargesByMember.get(memberId) || [];

    if (defaultedByMember.has(memberId)) {
      result.set(memberId, {
        state: "late",
        detail: "Payment plan defaulted",
      });
      continue;
    }

    const plan = planByMember.get(memberId);
    if (plan) {
      const progress = derivePlanProgress(plan, memberCharges, now);
      if (progress.isComplete) {
        result.set(memberId, { state: "on-time", detail: "Payment plan completed" });
      } else if (progress.missedCount > 0) {
        result.set(memberId, {
          state: "late",
          detail: `Payment plan ${progress.missedCount} installment${
            progress.missedCount === 1 ? "" : "s"
          } behind`,
        });
      } else {
        result.set(memberId, {
          state: "on-time",
          detail: `Payment plan on schedule (${progress.installments.filter((i) => i.status === "paid").length}/${progress.installments.length} paid)`,
        });
      }
      continue;
    }

    const verdicts = memberCharges
      .map((charge) => chargePunctuality(charge, now))
      .filter((verdict): verdict is "on-time" | "late" | "pending" => verdict !== null);

    if (!verdicts.length) {
      // Either every charge was waived or voided, or nothing has been billed
      // yet. The first is settled; the second is `none`, which scores as not
      // yet earned rather than as a free point — dues arrive every semester,
      // and a member cannot have paid one that hasn't been raised.
      result.set(memberId, {
        state: memberCharges.length ? "on-time" : "none",
        detail: memberCharges.length ? "Dues settled" : "No dues charged this semester",
      });
      continue;
    }

    if (verdicts.includes("late")) {
      result.set(memberId, { state: "late", detail: "Dues paid late or overdue" });
    } else if (verdicts.includes("pending")) {
      result.set(memberId, { state: "pending", detail: "Dues not yet due" });
    } else {
      result.set(memberId, { state: "on-time", detail: "Dues paid on time" });
    }
  }

  return result;
}
