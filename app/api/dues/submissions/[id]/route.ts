// app/api/dues/submissions/[id]/route.ts
// An officer checking a member's payment claim: verify it into the ledger, or
// send it back with a reason.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import { requireTreasury } from "@/lib/duesAuth";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { normalizeDueDate, serializeCharge } from "@/lib/dues";
import { serializeSubmission } from "@/lib/submissions";
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

function phoenixDay(value: Date) {
  return value.toLocaleDateString("en-US", PHOENIX_DATE);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action !== "verify" && action !== "reject") {
      return NextResponse.json(
        { error: 'action must be "verify" or "reject"' },
        { status: 400 }
      );
    }

    const submission = await PaymentSubmission.findById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: `This claim was already ${submission.status}` },
        { status: 409 }
      );
    }

    if (action === "reject") {
      // A rejection the member can't see the reason for is how this feature
      // loses their trust — and the disagreement belongs in the record either
      // way, since the app documents it rather than resolving it.
      const reviewNote = String(body?.reviewNote || "").trim();
      if (!reviewNote) {
        return NextResponse.json(
          { error: "reviewNote is required when rejecting a claim" },
          { status: 400 }
        );
      }

      submission.status = "rejected";
      submission.reviewedBy = viewer._id;
      submission.reviewedAt = new Date();
      submission.reviewNote = reviewNote;
      await submission.save();

      await recordFinanceEvent({
        memberId: submission.memberId,
        actorId: viewer._id,
        type: "payment_rejected",
        amountCents: submission.amountCents,
        summary: `Rejected a ${formatCents(submission.amountCents)} ${submission.method} claim: ${reviewNote}`,
        refs: {
          chargeId: submission.chargeId,
          submissionId: submission._id,
        },
        meta: { reviewNote },
      });

      await announce({
        event: "payment_rejected",
        memberId: submission.memberId,
        actorId: viewer._id,
        amountCents: submission.amountCents,
        summary: `Rejected a ${formatCents(submission.amountCents)} ${submission.method} claim: ${reviewNote}`,
        refs: { chargeId: submission.chargeId, submissionId: submission._id },
        member: {
          template: "payment_rejected",
          context: { amountCents: submission.amountCents, reason: reviewNote },
        },
      });

      logger.info({ submissionId: params.id }, "Payment claim rejected");
      return NextResponse.json(
        { submission: serializeSubmission(submission.toObject()) },
        { status: 200 }
      );
    }

    // --- verify ---
    const charge = await DuesCharge.findById(submission.chargeId);
    if (!charge) {
      return NextResponse.json(
        { error: "The charge this claim points at no longer exists" },
        { status: 404 }
      );
    }
    if (charge.status !== "open") {
      return NextResponse.json(
        { error: `That charge is ${charge.status}, so nothing can be posted to it` },
        { status: 409 }
      );
    }

    // The claim may have been sitting in the queue while the balance moved.
    const outstanding = balanceCentsFor(charge);
    if (outstanding <= 0) {
      return NextResponse.json(
        { error: "That charge is already settled" },
        { status: 409 }
      );
    }

    // An officer can correct the amount as well as the date — the member is
    // reporting from memory, and a Venmo screenshot is the source of truth.
    let amountCents = Number(submission.amountCents) || 0;
    if (body?.amountCents !== undefined && body.amountCents !== null) {
      const corrected = Math.round(Number(body.amountCents));
      if (!Number.isFinite(corrected) || corrected <= 0) {
        return NextResponse.json(
          { error: "amountCents must be greater than zero" },
          { status: 400 }
        );
      }
      amountCents = corrected;
    }
    if (amountCents > outstanding) {
      return NextResponse.json(
        {
          error: `That's more than the ${formatCents(outstanding)} still owed on this charge`,
          outstandingCents: outstanding,
        },
        { status: 400 }
      );
    }

    // Defaults to what the member said, not to today. An officer clearing a
    // week-old backlog shouldn't have to remember to backdate — the fair
    // behaviour is the one that happens when they just click approve.
    const paidOn = body?.paidOn
      ? normalizeDueDate(body.paidOn)
      : submission.paidOn;
    if (!paidOn) {
      return NextResponse.json({ error: "Invalid paidOn" }, { status: 400 });
    }

    charge.payments.push({
      amountCents,
      method: submission.method,
      reference: submission.reference,
      paidOn,
      recordedAt: new Date(),
      recordedBy: viewer._id,
      sourceRef: submission._id,
    });
    await charge.save();

    const created = charge.payments[charge.payments.length - 1];

    submission.status = "verified";
    submission.reviewedBy = viewer._id;
    submission.reviewedAt = new Date();
    submission.reviewNote = String(body?.reviewNote || "");
    submission.amountCents = amountCents;
    submission.paidOn = paidOn;
    submission.resultPaymentId = created?._id ?? null;
    await submission.save();

    const remaining = balanceCentsFor(charge);
    const submittedAt = submission.submittedAt
      ? new Date(submission.submittedAt)
      : null;
    // Only say "verified today" when that differs from the payment date —
    // otherwise the timeline reads as though something happened twice.
    const gap =
      submittedAt && phoenixDay(paidOn) !== phoenixDay(new Date())
        ? `, paid ${phoenixDay(paidOn)}, verified ${phoenixDay(new Date())}`
        : "";

    await recordFinanceEvent({
      memberId: submission.memberId,
      actorId: viewer._id,
      type: "payment_verified",
      amountCents,
      summary:
        `Verified ${formatCents(amountCents)} by ${submission.method}${gap}. ` +
        (remaining > 0
          ? `${formatCents(remaining)} still owed.`
          : "Balance settled."),
      // The event belongs on the day the money moved, so the timeline reads in
      // the order things actually happened rather than the order an officer
      // got to them.
      occurredAt: paidOn,
      refs: {
        chargeId: charge._id,
        submissionId: submission._id,
        paymentId: created?._id ?? null,
      },
      meta: {
        method: submission.method,
        paidOn: paidOn.toISOString(),
        verifiedAt: new Date().toISOString(),
        remainingCents: remaining,
      },
    });

    await announce({
      event: "payment_verified",
      memberId: submission.memberId,
      actorId: viewer._id,
      amountCents,
      summary: `Verified ${formatCents(amountCents)} by ${submission.method}`,
      refs: { chargeId: charge._id, submissionId: submission._id },
      member: {
        template: "payment_verified",
        context: {
          amountCents,
          method: submission.method,
          reason:
            remaining > 0
              ? `${formatCents(remaining)} still owed.`
              : "Your balance is settled.",
        },
      },
    });

    logger.info(
      { submissionId: params.id, amountCents, remaining },
      "Payment claim verified"
    );
    return NextResponse.json(
      {
        submission: serializeSubmission(submission.toObject()),
        charge: serializeCharge(charge.toObject()),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to review payment claim");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// A member taking their own claim back.
///
/// Only their own, and only while nobody has answered it: once an officer has
/// verified or rejected it the answer is part of the record and withdrawing it
/// would be rewriting history. The row is kept rather than deleted so the trail
/// still shows the claim was made — every "pending" filter in the codebase
/// excludes a withdrawn one already, so nothing else has to change.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id rollNo").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const submission = await PaymentSubmission.findById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.memberId?.toString() !== member._id.toString()) {
      return NextResponse.json({ error: "That isn't your claim" }, { status: 403 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: `This claim was already ${submission.status}` },
        { status: 409 }
      );
    }

    submission.status = "withdrawn";
    submission.reviewedAt = new Date();
    await submission.save();

    await recordFinanceEvent({
      memberId: member._id,
      actorId: member._id,
      type: "payment_removed",
      amountCents: submission.amountCents,
      summary: `Withdrew a ${formatCents(submission.amountCents)} payment report`,
      refs: { submissionId: submission._id, chargeId: submission.chargeId },
    });

    // Officers only — a claim vanishing from the queue is something they need
    // to see, and the member is the one who pulled it.
    await announce({
      event: "payment_removed",
      memberId: member._id,
      actorId: member._id,
      amountCents: submission.amountCents,
      summary: `Withdrew a ${formatCents(submission.amountCents)} payment report`,
      refs: { submissionId: submission._id, chargeId: submission.chargeId },
    });

    const charge = await DuesCharge.findById(submission.chargeId).lean<any>();
    return NextResponse.json(
      {
        submission: serializeSubmission(submission),
        charge: charge ? serializeCharge(charge) : null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to withdraw a submission");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
