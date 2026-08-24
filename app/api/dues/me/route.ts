// app/api/dues/me/route.ts
// The signed-in member's own ledger.
//
// Members never write to their balance here — they file claims and requests
// through the submission, plan, and reimbursement routes, and an officer turns
// those into ledger entries.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import { summarize } from "@/lib/dues";
import { serializeSubmission } from "@/lib/submissions";
import { creditBalanceCents } from "@/lib/credit";
import PaymentPlan from "@/lib/models/PaymentPlan";
import {
  currentDueAcross,
  graceWindowOpen,
  partitionPlans,
  serializePlan,
} from "@/lib/plans";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const filter: any = { memberId: member._id };
    const term = searchParams.get("term");
    if (term) filter.term = term;

    const [charges, submissions, creditCents, plans] = await Promise.all([
      DuesCharge.find(filter).lean(),
      PaymentSubmission.find({ memberId: member._id })
        .sort({ submittedAt: -1 })
        .limit(25)
        .lean<any[]>(),
      creditBalanceCents(member._id),
      PaymentPlan.find({ memberId: member._id })
        .sort({ proposedAt: -1 })
        .limit(10)
        .lean<any[]>(),
    ]);

    const now = new Date();
    // A member with a claim in the queue has already done their part. Nothing
    // should mark them late while an officer gets to it.
    const pending = submissions.filter(
      (submission) => submission.status === "pending"
    );
    // A member can run several plans at once — one per charge they asked to
    // spread out — so the screens get a list. Finished plans drop out of it
    // here rather than waiting for the nightly cron to stamp them `completed`,
    // which is what stops a paid-off plan sitting on the page as if it were
    // still collecting.
    const { live: livePlans, finished: finishedPlans } = partitionPlans(
      plans.filter((row) => row.status === "active" || row.status === "pending"),
      charges as any[],
      now
    );
    // The one to lead with, and the one older app builds read as `plan`.
    const plan =
      livePlans.find((row) => row.status === "active") ??
      livePlans.find((row) => row.status === "pending") ??
      null;
    // Waiting on a plan answer suppresses overdue for exactly the reason a
    // pending payment claim does, and a denial buys five more days on top.
    const awaitingPlan = plans.some((row) => row.status === "pending");
    const inGrace = plans.some((row) => graceWindowOpen(row, now));
    const summary = summarize(
      charges,
      now,
      pending.length > 0 || awaitingPlan || inGrace
    );
    const chargesFor = (row: any) =>
      (charges as any[]).filter((charge) =>
        (row?.chargeIds ?? []).some((id: any) => String(id) === String(charge._id))
      );
    const planCharges = plan ? chargesFor(plan) : [];
    // What they owe right now across every plan plus anything no plan covers.
    const due = currentDueAcross(
      livePlans,
      charges as any[],
      summary.nextDueDate,
      now
    );

    return NextResponse.json(
      {
        ...summary,
        // What to put on screen right now: this month's installment once a plan
        // is running, the whole balance otherwise. Every client reads this
        // rather than `balanceCents`, which is what makes an approved plan
        // visible everywhere at once.
        amountDueNowCents: due.amountDueNowCents,
        dueNowDate: due.dueNowDate,
        /// The live plan or the proposal in the queue, null when neither.
        /// Kept for app builds that shipped before plans went plural — it is
        /// the first entry of `plans`.
        plan: plan ? serializePlan(plan, planCharges, now) : null,
        /// Every plan still collecting: several can run at once, each covering
        /// a different set of charges.
        plans: livePlans.map((row) => serializePlan(row, chargesFor(row), now)),
        /// Paid off, denied or cancelled — kept for the record, off the way.
        archivedPlans: finishedPlans.map((row) =>
          serializePlan(row, chargesFor(row), now)
        ),
        /// Charges no live plan covers, so a client knows what a new plan could
        /// still be proposed for without re-deriving it.
        planEligibleChargeIds: (charges as any[])
          .filter(
            (charge) =>
              charge.status === "open" &&
              balanceCentsFor(charge) > 0 &&
              !livePlans.some((row) =>
                (row.chargeIds ?? []).some(
                  (id: any) => String(id) === String(charge._id)
                )
              )
          )
          .map((charge) => String(charge._id)),
        awaitingPlanReview: awaitingPlan,
        // The chapter's debt to this member. Credit auto-applies to open
        // charges, so this and `amountDueNowCents` are never both non-zero.
        creditCents,
        awaitingReview: pending.length > 0,
        pendingCents: pending.reduce(
          (sum, submission) => sum + (Number(submission.amountCents) || 0),
          0
        ),
        submissions: submissions.map((submission) =>
          serializeSubmission(submission)
        ),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to load dues for member");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
