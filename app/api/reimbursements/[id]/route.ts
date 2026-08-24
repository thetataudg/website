// app/api/reimbursements/[id]/route.ts
// An officer reviewing a claim. Approving mints credit and immediately drains
// it into whatever the member owes.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Reimbursement from "@/lib/models/Reimbursement";
import { requireTreasury } from "@/lib/duesAuth";
import {
  applyCreditToOpenCharges,
  creditBalanceCents,
  mintCredit,
} from "@/lib/credit";
import { serializeReimbursement } from "@/lib/reimbursements";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "Invalid reimbursement id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action !== "approve" && action !== "deny") {
      return NextResponse.json(
        { error: 'action must be "approve" or "deny"' },
        { status: 400 }
      );
    }

    const reimbursement = await Reimbursement.findById(params.id);
    if (!reimbursement) {
      return NextResponse.json({ error: "Reimbursement not found" }, { status: 404 });
    }
    if (reimbursement.status !== "pending") {
      return NextResponse.json(
        { error: `This claim was already ${reimbursement.status}` },
        { status: 409 }
      );
    }

    if (action === "deny") {
      const reviewNote = String(body?.reviewNote || "").trim();
      if (!reviewNote) {
        return NextResponse.json(
          { error: "reviewNote is required when denying a claim" },
          { status: 400 }
        );
      }

      reimbursement.status = "denied";
      reimbursement.reviewedBy = viewer._id;
      reimbursement.reviewedAt = new Date();
      reimbursement.reviewNote = reviewNote;
      await reimbursement.save();

      await recordFinanceEvent({
        memberId: reimbursement.memberId,
        actorId: viewer._id,
        type: "reimbursement_denied",
        amountCents: reimbursement.amountCents,
        summary: `Denied a ${formatCents(reimbursement.amountCents)} claim: ${reviewNote}`,
        refs: { reimbursementId: reimbursement._id },
        meta: { reviewNote },
      });

      await announce({
        event: "reimbursement_denied",
        memberId: reimbursement.memberId,
        actorId: viewer._id,
        amountCents: reimbursement.amountCents,
        summary: `Denied a ${formatCents(reimbursement.amountCents)} claim: ${reviewNote}`,
        refs: { reimbursementId: reimbursement._id },
        member: {
          template: "reimbursement_denied",
          context: {
            amountCents: reimbursement.amountCents,
            description: reimbursement.description,
            reason: reviewNote,
          },
        },
      });

      return NextResponse.json(
        { reimbursement: serializeReimbursement(reimbursement.toObject()) },
        { status: 200 }
      );
    }

    // --- approve ---
    // An officer can correct the amount against the receipt; the member is
    // reporting from a crumpled slip in their pocket.
    let amountCents = Number(reimbursement.amountCents) || 0;
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

    const entry = await mintCredit({
      memberId: reimbursement.memberId,
      amountCents,
      actorId: viewer._id,
      reimbursementId: reimbursement._id,
      note: reimbursement.description,
    });

    reimbursement.status = "approved";
    reimbursement.amountCents = amountCents;
    reimbursement.reviewedBy = viewer._id;
    reimbursement.reviewedAt = new Date();
    reimbursement.reviewNote = String(body?.reviewNote || "");
    reimbursement.creditEntryId = entry._id;
    await reimbursement.save();

    await recordFinanceEvent({
      memberId: reimbursement.memberId,
      actorId: viewer._id,
      type: "reimbursement_approved",
      amountCents,
      summary: `Approved ${formatCents(amountCents)} for ${reimbursement.description}`,
      refs: { reimbursementId: reimbursement._id, creditEntryId: entry._id },
    });

    // Straight into whatever they owe. A member who is both owed $40 and owes
    // $250 should end up owing $210 — not holding a credit note beside a bill.
    const application = await applyCreditToOpenCharges(
      reimbursement.memberId,
      viewer._id
    );

    // What the member actually wants to know is where the money went: straight
    // onto what they owed, or into credit they still hold.
    const remainingLabel = application.appliedCents > 0
      ? application.remainingCreditCents > 0
        ? `${formatCents(application.appliedCents)} went against what you owed, and you're holding ${formatCents(application.remainingCreditCents)} in credit.`
        : `It went straight against what you owed.`
      : "It's been added to your account as credit.";

    await announce({
      event: "reimbursement_approved",
      memberId: reimbursement.memberId,
      actorId: viewer._id,
      amountCents,
      summary: `Approved ${formatCents(amountCents)} for ${reimbursement.description}`,
      refs: { reimbursementId: reimbursement._id },
      member: {
        template: "reimbursement_approved",
        context: {
          amountCents,
          description: reimbursement.description,
          remainingLabel,
        },
      },
    });

    logger.info(
      {
        reimbursementId: params.id,
        amountCents,
        appliedCents: application.appliedCents,
        remainingCredit: application.remainingCreditCents,
      },
      "Reimbursement approved"
    );

    return NextResponse.json(
      {
        reimbursement: serializeReimbursement(reimbursement.toObject()),
        applied: application,
        creditCents: await creditBalanceCents(reimbursement.memberId),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to review reimbursement");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
