// lib/duesRead.ts
// Reading the ledger: the treasurer's roster and one member's summary.
//
// These were inline in `GET /api/dues`. The MCP dues tools read the same
// numbers, and the roster arithmetic (plans, pending review, credit, overdue)
// is exactly the sort of thing that must not exist twice. Who may call these is
// decided by the caller (`canManageDues` in `lib/duesAuth.ts`).
import Member from "@/lib/models/Member";
import DuesCharge, {
  balanceCentsFor,
  paidCentsFor,
} from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { serializeCharge, summarize } from "@/lib/dues";
import { membersAwaitingReview } from "@/lib/submissions";
import {
  activePlansFor,
  derivePlanProgress,
  membersAwaitingPlanReview,
  onScheduleChargeIds,
} from "@/lib/plans";
import { creditBalancesFor } from "@/lib/credit";

/// "Who owes what", per member, for the charges given (already filtered by
/// term / status by the caller). Members who owe nothing still appear.
export async function loadDuesRoster(charges: any[]) {
  const active = await Member.find({ status: "Active" })
    .select("rollNo fName lName")
    .lean<any[]>();

  const byMember = new Map<string, any[]>();
  for (const charge of charges as any[]) {
    const key = charge.memberId?.toString();
    if (!key) continue;
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key)!.push(charge);
  }

  // Members who owe nothing still belong on the roster — an empty row is
  // how a treasurer confirms someone is settled rather than missing.
  const rosterIds = new Set([
    ...active.map((member) => member._id.toString()),
    ...Array.from(byMember.keys()),
  ]);

  const extraIds = Array.from(rosterIds).filter(
    (id) => !active.some((member) => member._id.toString() === id)
  );
  const extras = extraIds.length
    ? await Member.find({ _id: { $in: extraIds } })
        .select("rollNo fName lName status")
        .lean<any[]>()
    : [];
  const memberById = new Map(
    [...active, ...extras].map((member) => [member._id.toString(), member])
  );

  const awaiting = await membersAwaitingReview(Array.from(rosterIds));
  // One aggregation for the whole chapter rather than two queries each.
  const credits = await creditBalancesFor(Array.from(rosterIds));
  const [awaitingPlan, plansByMember] = await Promise.all([
    membersAwaitingPlanReview(Array.from(rosterIds)),
    activePlansFor(Array.from(rosterIds)),
  ]);
  const now = new Date();

  const rows = Array.from(rosterIds).map((id) => {
    const member = memberById.get(id);
    const own = byMember.get(id) ?? [];
    const open = own.filter((charge) => charge.status === "open");
    // Somebody waiting on either queue is waiting on the chapter.
    const pendingReview = awaiting.has(id) || awaitingPlan.has(id);
    // A member can run several plans at once. The roster leads with the one
    // that most needs attention — furthest behind, then soonest due — and
    // reports the count so a treasurer can see there are others.
    const memberPlans = plansByMember.get(id) ?? [];
    const scored = memberPlans
      .map((row: any) => ({ row, progress: derivePlanProgress(row, own, now) }))
      .filter((entry: any) => !entry.progress.isComplete)
      .sort((a: any, b: any) => {
        if (b.progress.missedCount !== a.progress.missedCount) {
          return b.progress.missedCount - a.progress.missedCount;
        }
        const aDue = a.progress.dueNowDate ? new Date(a.progress.dueNowDate).getTime() : Infinity;
        const bDue = b.progress.dueNowDate ? new Date(b.progress.dueNowDate).getTime() : Infinity;
        return aDue - bDue;
      });
    const livePlan = scored[0]?.row ?? null;
    const planProgress = scored[0]?.progress ?? null;
    const planCount = scored.length;
    const balanceCents = own.reduce(
      (sum, charge) => sum + balanceCentsFor(charge),
      0
    );
    const dueDates = open
      .filter((charge) => balanceCentsFor(charge) > 0 && charge.dueDate)
      .map((charge) => new Date(charge.dueDate).getTime())
      .sort((a, b) => a - b);

    return {
      memberId: id,
      rollNo: member?.rollNo ?? "Unknown",
      fName: member?.fName ?? "Unknown",
      lName: member?.lName ?? "",
      status: member?.status ?? "Active",
      assignedCents: open.reduce(
        (sum, charge) => sum + (Number(charge.amountCents) || 0),
        0
      ),
      paidCents: own.reduce((sum, charge) => sum + paidCentsFor(charge), 0),
      balanceCents,
      creditCents: credits.get(id) ?? 0,
      chargeCount: open.length,
      nextDueDate: dueDates.length
        ? new Date(dueDates[0]).toISOString()
        : null,
      // Somebody waiting on review is not late, however long it takes.
      awaitingReview: pendingReview,
      // A member on a live plan has agreed dates that run past the charge's
      // own due date, so the charge-level overdue flag is the wrong
      // question for them — the installment is.
      plan: planProgress
        ? {
            _id: String(livePlan._id),
            // How many live plans this member is running, this one included.
            planCount,
            installmentCount: planProgress.installments.length,
            currentSeq: planProgress.currentSeq,
            amountDueNowCents: planProgress.amountDueNowCents,
            dueNowDate: planProgress.dueNowDate,
            paidCents: planProgress.paidCents,
            remainingCents: planProgress.remainingCents,
            missedCount: planProgress.missedCount,
            isBehind: planProgress.missedCount > 0,
          }
        : null,
      isOverdue: planProgress
        ? planProgress.missedCount > 0
        : !pendingReview &&
          open.some(
            (charge) =>
              balanceCentsFor(charge) > 0 &&
              serializeCharge(charge, now).isOverdue
          ),
    };
  });

  rows.sort((a, b) => {
    if (a.balanceCents !== b.balanceCents) return b.balanceCents - a.balanceCents;
    return `${a.lName}${a.fName}`.localeCompare(`${b.lName}${b.fName}`);
  });

  const [pendingCount, pendingPlanCount] = await Promise.all([
    PaymentSubmission.countDocuments({ status: "pending" }),
    PaymentPlan.countDocuments({ status: "pending" }),
  ]);

  return {
    members: rows,
    totals: {
      currency: "USD",
      outstandingCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
      collectedCents: rows.reduce((sum, row) => sum + row.paidCents, 0),
      // What the chapter owes its members, which is a debt the treasurer
      // should see as plainly as the one owed to them.
      creditOwedCents: rows.reduce((sum, row) => sum + row.creditCents, 0),
      memberCount: rows.length,
      owingCount: rows.filter((row) => row.balanceCents > 0).length,
      overdueCount: rows.filter((row) => row.isOverdue).length,
      pendingReviewCount: pendingCount,
      pendingPlanCount,
      activePlanCount: rows.filter((row) => row.plan).length,
      planBehindCount: rows.filter((row) => row.plan?.isBehind).length,
    },
  };

}

/// One member's ledger summary, the shape `/api/dues/me` leads with. `filter`
/// narrows the charges (for example `{ term }`).
export async function loadMemberLedger(
  memberId: any,
  filter: Record<string, unknown> = {}
) {
  const charges = await DuesCharge.find({ ...filter, memberId }).lean();
  const plans = await PaymentPlan.find({
    memberId,
    status: "active",
  }).lean<any[]>();
  const now = new Date();
  return summarize(
    charges,
    now,
    false,
    onScheduleChargeIds(plans, charges as any[], now)
  );
}
