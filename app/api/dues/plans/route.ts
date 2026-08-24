// app/api/dues/plans/route.ts
// A member asking to pay in installments, and the officer queue of proposals
// waiting for an answer.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor, paidCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { requireTreasury } from "@/lib/duesAuth";
import { getDefaultSemesterRange } from "@/lib/gem";
import { normalizeDueDate } from "@/lib/dues";
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  MIN_INSTALLMENT_CENTS,
  anchorDueDateFor,
  buildSchedule,
  chargeIdsUnderLivePlans,
  maxInstallmentsFor,
  proposalWindowOpen,
  serializePlan,
} from "@/lib/plans";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOENIX_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Phoenix",
};

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const now = new Date();

    // A member reading their own plans needs no treasury role.
    if (searchParams.get("mine") === "1") {
      const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
      if (!member) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      const mine = await PaymentPlan.find({ memberId: member._id })
        .sort({ proposedAt: -1 })
        .lean<any[]>();
      const charges = await chargesForPlans(mine);
      return NextResponse.json(
        { plans: mine.map((plan) => serializePlan(plan, charges, now)) },
        { status: 200 }
      );
    }

    await requireTreasury(req);

    const filter: any = {};
    const status = searchParams.get("status") ?? "pending";
    if (status !== "all") filter.status = status;

    const plans = await PaymentPlan.find(filter)
      // Oldest first: the queue is a backlog, and someone who filed before their
      // due date is waiting on the chapter, not the other way round.
      .sort({ proposedAt: 1 })
      .lean<any[]>();

    const memberIds = Array.from(
      new Set(plans.map((plan) => plan.memberId?.toString()).filter(Boolean))
    );
    const [members, charges] = await Promise.all([
      Member.find({ _id: { $in: memberIds } })
        .select("rollNo fName lName")
        .lean<any[]>(),
      chargesForPlans(plans),
    ]);
    const memberById = new Map(members.map((m) => [m._id.toString(), m]));
    const chargeById = new Map(charges.map((c: any) => [String(c._id), c]));

    const rows = plans.map((plan) => {
      const member = memberById.get(plan.memberId?.toString());
      const covered = (plan.chargeIds ?? [])
        .map((id: any) => chargeById.get(String(id)))
        .filter(Boolean);
      return {
        ...serializePlan(plan, covered, now),
        member: member
          ? { rollNo: member.rollNo, fName: member.fName, lName: member.lName }
          : null,
        // The original deadline travels with the proposal so the officer can see
        // it was filed in time without opening the charge.
        charges: covered.map((charge: any) => ({
          _id: String(charge._id),
          description: charge.description,
          term: charge.term,
          amountCents: charge.amountCents,
          balanceCents: balanceCentsFor(charge),
          dueDate: charge.dueDate ? new Date(charge.dueDate).toISOString() : null,
        })),
        ageDays: plan.proposedAt
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(plan.proposedAt).getTime()) / 86400000
              )
            )
          : 0,
      };
    });

    return NextResponse.json(
      {
        plans: rows,
        totals: {
          pendingCount: rows.filter((row) => row.status === "pending").length,
          pendingCents: rows
            .filter((row) => row.status === "pending")
            .reduce((sum, row) => sum + row.totalCents, 0),
          activeCount: rows.filter((row) => row.status === "active").length,
          defaultedCount: rows.filter((row) => row.status === "defaulted").length,
          oldestPendingDays: rows
            .filter((row) => row.status === "pending")
            .reduce((max, row) => Math.max(max, row.ageDays), 0),
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to list payment plans");
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 500 });
  }
}

async function chargesForPlans(plans: any[]) {
  const ids = Array.from(
    new Set(
      plans.flatMap((plan) => (plan.chargeIds ?? []).map((id: any) => String(id)))
    )
  );
  if (!ids.length) return [];
  return DuesCharge.find({ _id: { $in: ids } }).lean<any[]>();
}

/// A member proposing terms for what they currently owe.
export async function POST(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId })
      .select("_id rollNo fName lName")
      .lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await req.json();
    const term = String(body?.term || getDefaultSemesterRange().name);

    const open = await DuesCharge.find({
      memberId: member._id,
      term,
      status: "open",
    }).lean<any[]>();

    // Several plans may run at once — one per thing the member asked to spread
    // out. The rule is not "one plan" but "one plan per charge": two schedules
    // claiming the same money is the thing that can't be allowed.
    const existingPlans = await PaymentPlan.find({
      memberId: member._id,
      status: { $in: ["pending", "active"] },
    }).lean<any[]>();
    const allCharges = await DuesCharge.find({ memberId: member._id }).lean<any[]>();
    const spokenFor = chargeIdsUnderLivePlans(existingPlans, allCharges);

    const eligible = open.filter(
      (charge) =>
        balanceCentsFor(charge) > 0 && !spokenFor.has(String(charge._id))
    );

    // The member picks what this plan covers. Omitting the field keeps the old
    // behaviour — everything still owed and not already on a plan.
    const requested: string[] | null = Array.isArray(body?.chargeIds)
      ? body.chargeIds.map((id: any) => String(id))
      : null;

    let owed = eligible;
    if (requested) {
      const wanted = new Set(requested);
      const clash = requested.filter((id) => spokenFor.has(id));
      if (clash.length) {
        return NextResponse.json(
          {
            error:
              "Some of those charges are already on a payment plan. Pick the ones that aren't.",
            chargeIds: clash,
          },
          { status: 409 }
        );
      }
      owed = eligible.filter((charge) => wanted.has(String(charge._id)));
      const missing = requested.filter(
        (id) => !owed.some((charge) => String(charge._id) === id)
      );
      if (missing.length) {
        return NextResponse.json(
          {
            error:
              "Some of those charges aren't open and owed this term. Reload and try again.",
            chargeIds: missing,
          },
          { status: 409 }
        );
      }
    }

    const totalCents = owed.reduce(
      (sum, charge) => sum + balanceCentsFor(charge),
      0
    );

    if (totalCents <= 0) {
      // Distinguish "you owe nothing" from "everything you owe is already on a
      // plan" — the second one is a member wondering why the button did nothing.
      const anythingOwed = open.some((charge) => balanceCentsFor(charge) > 0);
      return NextResponse.json(
        {
          error: anythingOwed
            ? "Everything you owe is already on a payment plan"
            : "You don't owe anything this term, so there is nothing to spread out",
        },
        { status: 409 }
      );
    }

    // The due date gates the asking, not the paying. Past Phoenix end-of-day on
    // the earliest deadline, the full amount is simply late.
    if (!proposalWindowOpen(owed)) {
      const anchor = anchorDueDateFor(owed);
      return NextResponse.json(
        {
          error: `Payment plans have to be requested before the due date${
            anchor ? `, this was due ${anchor.toLocaleDateString("en-US", PHOENIX_DATE)}` : ""
          }. Talk to the treasurer.`,
        },
        { status: 409 }
      );
    }

    const maxCount = maxInstallmentsFor(totalCents);
    if (maxCount < MIN_INSTALLMENTS) {
      return NextResponse.json(
        {
          error: `${formatCents(totalCents)} is too small to split: installments can't be under ${formatCents(MIN_INSTALLMENT_CENTS)}.`,
          maxInstallments: 0,
        },
        { status: 400 }
      );
    }

    const count = Math.round(Number(body?.installments));
    if (!Number.isFinite(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
      return NextResponse.json(
        { error: `installments must be between ${MIN_INSTALLMENTS} and ${MAX_INSTALLMENTS}` },
        { status: 400 }
      );
    }
    if (count > maxCount) {
      return NextResponse.json(
        {
          error: `${formatCents(totalCents)} over ${count} months would be under the ${formatCents(MIN_INSTALLMENT_CENTS)} minimum. The most you can split it is ${maxCount}.`,
          maxInstallments: maxCount,
        },
        { status: 400 }
      );
    }

    const anchor = anchorDueDateFor(owed) ?? normalizeDueDate(new Date());
    const schedule = buildSchedule(totalCents, count, anchor);

    const plan = await PaymentPlan.create({
      memberId: member._id,
      term,
      chargeIds: owed.map((charge) => charge._id),
      totalCents,
      // Progress measures this plan, not the member's whole history, so what
      // they'd already paid before asking is the zero point.
      baselinePaidCents: owed.reduce(
        (sum, charge) => sum + paidCentsFor(charge),
        0
      ),
      installments: schedule,
      proposedAt: new Date(),
      proposedAgainstDueDate: anchor,
      status: "pending",
      requestNote: String(body?.requestNote || ""),
    });

    await recordFinanceEvent({
      memberId: member._id,
      actorId: member._id,
      type: "plan_proposed",
      amountCents: totalCents,
      summary: `Requested a ${count}-month plan for ${formatCents(totalCents)}, first installment ${formatCents(schedule[0].amountCents)} on ${schedule[0].dueDate.toLocaleDateString("en-US", PHOENIX_DATE)}`,
      refs: { planId: plan._id },
      meta: {
        installments: count,
        requestNote: String(body?.requestNote || ""),
        proposedAgainstDueDate: anchor ? anchor.toISOString() : null,
      },
    });

    await announce({
      event: "plan_proposed",
      memberId: member._id,
      actorId: member._id,
      amountCents: totalCents,
      summary: `Requested a ${count}-month plan for ${formatCents(totalCents)}, first installment ${formatCents(schedule[0].amountCents)} on ${schedule[0].dueDate.toLocaleDateString("en-US", PHOENIX_DATE)}`,
      refs: { planId: plan._id },
    });

    logger.info(
      { planId: plan._id?.toString(), totalCents, count },
      "Payment plan proposed"
    );
    return NextResponse.json(serializePlan(plan.toObject(), owed), {
      status: 201,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to propose a payment plan");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
