// app/api/dues/plans/[id]/route.ts
// An officer answering a plan proposal — or a member withdrawing one.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { requireTreasury } from "@/lib/duesAuth";
import {
  denialGraceUntil,
  derivePlanProgress,
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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const action = String(body?.action || "");
  if (action !== "approve" && action !== "deny" && action !== "cancel") {
    return NextResponse.json(
      { error: 'action must be "approve", "deny" or "cancel"' },
      { status: 400 }
    );
  }

  // Cancelling is the one thing a member may do to their own plan — withdrawing
  // a request they no longer need is not an officer decision.
  let viewer: any;
  try {
    if (action === "cancel") {
      const clerkId = await requireAuth(req as any);
      await connectDB();
      viewer = await Member.findOne({ clerkId })
        .select("_id rollNo fName lName role isECouncil")
        .lean<any>();
      if (!viewer) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
    } else {
      viewer = await requireTreasury(req);
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode ?? 403 }
    );
  }

  try {
    const plan = await PaymentPlan.findById(params.id);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const charges = await DuesCharge.find({
      _id: { $in: plan.chargeIds ?? [] },
    }).lean<any[]>();

    if (action === "cancel") {
      const isOwner = String(plan.memberId) === String(viewer._id);
      const privileged =
        viewer.role === "admin" ||
        viewer.role === "superadmin" ||
        Boolean(viewer.isECouncil);
      if (!isOwner && !privileged) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (plan.status !== "pending" && plan.status !== "active") {
        return NextResponse.json(
          { error: `This plan is already ${plan.status}` },
          { status: 409 }
        );
      }

      const was = plan.status;
      plan.status = "cancelled";
      plan.reviewedBy = viewer._id;
      plan.reviewedAt = new Date();
      if (body?.reviewNote) plan.reviewNote = String(body.reviewNote);
      await plan.save();

      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: viewer._id,
        type: "plan_cancelled",
        amountCents: plan.totalCents,
        summary:
          was === "pending"
            ? `Withdrew the ${plan.installments.length}-month plan request for ${formatCents(plan.totalCents)}`
            : `Cancelled the ${plan.installments.length}-month plan for ${formatCents(plan.totalCents)}, the full balance is owed again`,
        refs: { planId: plan._id },
        meta: { was },
      });

      // Only tell the member if somebody else did it to them. A member
      // withdrawing their own request does not need to be told they did.
      const cancelledByOfficer = String(viewer._id) !== String(plan.memberId);
      await announce({
        event: "plan_cancelled",
        memberId: plan.memberId,
        actorId: viewer._id,
        amountCents: plan.totalCents,
        summary:
          was === "pending"
            ? `Withdrew the ${plan.installments.length}-month plan request for ${formatCents(plan.totalCents)}`
            : `Cancelled the ${plan.installments.length}-month plan for ${formatCents(plan.totalCents)}, the full balance is owed again`,
        refs: { planId: plan._id },
        member: cancelledByOfficer
          ? {
              template: "plan_cancelled",
              context: {
                amountCents: plan.totalCents,
                reason: String(body?.reviewNote || ""),
              },
            }
          : null,
      });

      logger.info({ planId: params.id, was }, "Payment plan cancelled");
      return NextResponse.json(
        { plan: serializePlan(plan.toObject(), charges) },
        { status: 200 }
      );
    }

    if (plan.status !== "pending") {
      return NextResponse.json(
        { error: `This plan was already ${plan.status}` },
        { status: 409 }
      );
    }

    if (action === "deny") {
      // A denial sends the member back to owing the whole amount, so they need
      // to know why — and they get five days rather than waking up overdue,
      // because they asked in good faith before the deadline and the answer is
      // news to them.
      const reviewNote = String(body?.reviewNote || "").trim();
      if (!reviewNote) {
        return NextResponse.json(
          { error: "reviewNote is required when denying a plan" },
          { status: 400 }
        );
      }

      const graceUntil = denialGraceUntil();
      plan.status = "denied";
      plan.reviewedBy = viewer._id;
      plan.reviewedAt = new Date();
      plan.reviewNote = reviewNote;
      plan.graceUntil = graceUntil;
      await plan.save();

      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: viewer._id,
        type: "plan_denied",
        amountCents: plan.totalCents,
        summary: `Denied the plan request for ${formatCents(plan.totalCents)}: ${reviewNote}. Full balance owed by ${graceUntil.toLocaleDateString("en-US", PHOENIX_DATE)}.`,
        refs: { planId: plan._id },
        meta: { reviewNote, graceUntil: graceUntil.toISOString() },
      });

      await announce({
        event: "plan_denied",
        memberId: plan.memberId,
        actorId: viewer._id,
        amountCents: plan.totalCents,
        summary: `Denied the plan request for ${formatCents(plan.totalCents)}: ${reviewNote}`,
        refs: { planId: plan._id },
        member: {
          template: "plan_denied",
          context: {
            amountCents: plan.totalCents,
            reason: reviewNote,
            dueLabel: graceUntil.toLocaleDateString("en-US", PHOENIX_DATE),
          },
        },
      });

      logger.info({ planId: params.id }, "Payment plan denied");
      return NextResponse.json(
        { plan: serializePlan(plan.toObject(), charges) },
        { status: 200 }
      );
    }

    // --- approve ---
    // The charge list locks here. A charge raised after this doesn't join the
    // plan; it gets its own due date, and the member can propose a new plan
    // that supersedes this one.
    plan.status = "active";
    plan.reviewedBy = viewer._id;
    plan.reviewedAt = new Date();
    plan.reviewNote = String(body?.reviewNote || "");
    await plan.save();

    const first = plan.installments?.[0];
    await recordFinanceEvent({
      memberId: plan.memberId,
      actorId: viewer._id,
      type: "plan_approved",
      amountCents: plan.totalCents,
      summary:
        `Approved a ${plan.installments.length}-month plan for ${formatCents(plan.totalCents)}` +
        (first
          ? `, ${formatCents(first.amountCents)} on ${new Date(first.dueDate).toLocaleDateString("en-US", PHOENIX_DATE)}, then monthly`
          : ""),
      refs: { planId: plan._id },
      // Punctuality hangs on when the member filed, not on when an officer got
      // to it, so the timeline puts the approval where the request was.
      meta: {
        proposedAt: plan.proposedAt ? new Date(plan.proposedAt).toISOString() : null,
        installments: plan.installments.length,
      },
    });

    // Money may have landed while the proposal sat in the queue — including an
    // automatic credit application. A plan that is already settled on the day
    // it's approved should say so rather than start chasing installments.
    const progress = derivePlanProgress(plan.toObject(), charges);
    if (progress.isComplete) {
      plan.status = "completed";
      await plan.save();
      await recordFinanceEvent({
        memberId: plan.memberId,
        actorId: null,
        type: "plan_completed",
        amountCents: plan.totalCents,
        summary: `Plan for ${formatCents(plan.totalCents)} was already settled when it was approved`,
        refs: { planId: plan._id },
      });
    }

    await announce({
      event: "plan_approved",
      memberId: plan.memberId,
      actorId: viewer._id,
      amountCents: plan.totalCents,
      summary: `Approved a ${plan.installments.length}-month plan for ${formatCents(plan.totalCents)}`,
      refs: { planId: plan._id },
      member: {
        template: "plan_approved",
        context: {
          amountCents: plan.totalCents,
          installmentCount: plan.installments.length,
          dueLabel: first
            ? new Date(first.dueDate).toLocaleDateString("en-US", PHOENIX_DATE)
            : "",
        },
      },
    });

    // A plan that was already settled when it was approved flips straight to
    // completed above; say so rather than leaving the member expecting
    // installments that will never be asked for.
    if (plan.status === "completed") {
      await announce({
        event: "plan_completed",
        memberId: plan.memberId,
        actorId: null,
        amountCents: plan.totalCents,
        summary: `Plan for ${formatCents(plan.totalCents)} was already settled when it was approved`,
        refs: { planId: plan._id },
        member: {
          template: "plan_completed",
          context: { amountCents: plan.totalCents },
        },
      });
    }

    logger.info({ planId: params.id, status: plan.status }, "Payment plan approved");
    return NextResponse.json(
      { plan: serializePlan(plan.toObject(), charges) },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to review payment plan");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
