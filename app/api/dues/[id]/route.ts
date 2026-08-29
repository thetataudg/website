// app/api/dues/[id]/route.ts
// Record payments against a charge, or amend/void it.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import DuesCharge, {
  balanceCentsFor,
  memberPaidCentsFor,
} from "@/lib/models/DuesCharge";
import { normalizeDueDate, readAmountCents, serializeCharge } from "@/lib/dues";
import { requireTreasury } from "@/lib/duesAuth";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
import type { NotifyTemplate } from "@/lib/notify/templates";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOENIX_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Phoenix",
};

/// A charge with money against it is history, not a mistake.
///
/// Raising a charge in error and taking it back is an everyday correction, so
/// voiding stays deliberately easy — right up to the moment the member pays.
/// After that, voiding would zero the balance (`balanceCentsFor` returns 0 for
/// anything not "open") while their payment stays recorded against a charge
/// that no longer claims to be owed, and the chapter would be holding money it
/// has no line item for. The fix in that case is a refund or a credit, both of
/// which leave a trail; this returns the officer to one.
function voidBlockedReason(charge: any): string | null {
  const paid = memberPaidCentsFor(charge);
  if (paid <= 0) return null;
  return `This charge has ${formatCents(paid)} paid against it, so it can't be removed. Refund the payment first, or waive the remaining balance instead.`;
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
    return NextResponse.json({ error: "Invalid charge id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const charge = await DuesCharge.findById(params.id);
    if (!charge) {
      return NextResponse.json({ error: "Charge not found" }, { status: 404 });
    }

    // Everything that happened in this request, written to the member's
    // history only once the save succeeds.
    const pending: Array<Parameters<typeof recordFinanceEvent>[0]> = [];
    const amountBefore = Number(charge.amountCents) || 0;
    const statusBefore = charge.status;

    if (body?.payment) {
      const paymentCents = readAmountCents(body.payment);
      if (paymentCents === null || paymentCents <= 0) {
        return NextResponse.json(
          { error: "payment.amountCents must be greater than zero" },
          { status: 400 }
        );
      }

      // When the money moved, which is a different question from when it
      // reached the system. Punctuality is judged on this date and never on
      // `recordedAt` — a member who paid the day before the deadline and
      // waited a week for approval is not late.
      let paidOn = new Date();
      if (body.payment.paidOn !== undefined && body.payment.paidOn !== null) {
        const stated = new Date(body.payment.paidOn);
        if (Number.isNaN(stated.getTime())) {
          return NextResponse.json(
            { error: "Invalid payment.paidOn" },
            { status: 400 }
          );
        }
        paidOn = stated;
      }

      charge.payments.push({
        amountCents: paymentCents,
        method: body.payment.method || "other",
        reference: String(body.payment.reference || ""),
        paidOn,
        recordedAt: new Date(),
        recordedBy: viewer._id,
        sourceRef: body.payment.sourceRef || null,
      });

      const method = body.payment.method || "other";
      pending.push({
        memberId: charge.memberId,
        actorId: viewer._id,
        type: "payment_recorded",
        amountCents: paymentCents,
        // Say both dates whenever they differ, so the gap is legible in the
        // timeline instead of being quietly flattened into one.
        summary:
          paidOn.toLocaleDateString("en-US", PHOENIX_DATE) ===
          new Date().toLocaleDateString("en-US", PHOENIX_DATE)
            ? `Recorded ${formatCents(paymentCents)} by ${method}`
            : `Recorded ${formatCents(paymentCents)} by ${method}, paid ${paidOn.toLocaleDateString("en-US", PHOENIX_DATE)}`,
        occurredAt: new Date(),
        refs: { chargeId: charge._id },
        meta: { method, paidOn: paidOn.toISOString() },
      });
    }

    // Dropping a payment needs its subdocument id — amounts alone are
    // ambiguous when someone pays the same figure twice.
    if (body?.removePaymentId) {
      const removed = charge.payments.find(
        (payment: any) => payment._id?.toString() === String(body.removePaymentId)
      );
      charge.payments = charge.payments.filter(
        (payment: any) => payment._id?.toString() !== String(body.removePaymentId)
      );
      if (removed) {
        pending.push({
          memberId: charge.memberId,
          actorId: viewer._id,
          type: "payment_removed",
          amountCents: -(Number(removed.amountCents) || 0),
          summary: `Removed a ${formatCents(Number(removed.amountCents) || 0)} ${removed.method || "other"} payment`,
          refs: { chargeId: charge._id },
          meta: { reason: String(body.reason || "") },
        });
      }
    }

    const amountCents = readAmountCents(body);
    if (amountCents !== null) {
      if (amountCents < 0) {
        return NextResponse.json({ error: "Amount cannot be negative" }, { status: 400 });
      }
      charge.amountCents = amountCents;
    }
    if (body?.description !== undefined) charge.description = String(body.description);
    if (body?.category !== undefined) charge.category = body.category;
    if (body?.term !== undefined) charge.term = String(body.term);
    if (body?.notes !== undefined) charge.notes = String(body.notes);
    if (body?.dueDate !== undefined) {
      if (body.dueDate === null) {
        charge.dueDate = null;
      } else {
        const dueDate = normalizeDueDate(body.dueDate);
        if (!dueDate) {
          return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
        }
        charge.dueDate = dueDate;
      }
    }
    if (body?.status !== undefined) {
      if (!["open", "waived", "void"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (body.status === "void" && statusBefore !== "void") {
        const blocked = voidBlockedReason(charge);
        if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
      }
      charge.status = body.status;
    }

    if (amountCents !== null && amountCents !== amountBefore) {
      pending.push({
        memberId: charge.memberId,
        actorId: viewer._id,
        type: "charge_amended",
        amountCents,
        summary: `Charge amended from ${formatCents(amountBefore)} to ${formatCents(amountCents)}`,
        refs: { chargeId: charge._id },
        meta: { from: amountBefore, to: amountCents, reason: String(body.reason || "") },
      });
    }

    if (body?.status !== undefined && body.status !== statusBefore) {
      if (body.status === "waived") {
        pending.push({
          memberId: charge.memberId,
          actorId: viewer._id,
          type: "charge_waived",
          amountCents: Number(charge.amountCents) || 0,
          summary: `Waived ${formatCents(Number(charge.amountCents) || 0)} for ${charge.description}`,
          refs: { chargeId: charge._id },
          meta: { reason: String(body.reason || "") },
        });
      } else if (body.status === "void") {
        pending.push({
          memberId: charge.memberId,
          actorId: viewer._id,
          type: "charge_voided",
          amountCents: Number(charge.amountCents) || 0,
          summary: `Voided ${formatCents(Number(charge.amountCents) || 0)} for ${charge.description}`,
          refs: { chargeId: charge._id },
          meta: { reason: String(body.reason || "") },
        });
      }
    }

    await charge.save();
    for (const event of pending) await recordFinanceEvent(event);

    // Everything this endpoint can do is an officer moving somebody else's
    // ledger, so every one of these is news to the member. The event types and
    // the member-facing template names are deliberately the same word — one
    // amendment produces one audit row and one message that agree by
    // construction rather than by being kept in step by hand.
    const remaining = balanceCentsFor(charge.toObject());
    const remainingLabel =
      remaining > 0 ? `${formatCents(remaining)} still owed.` : "Your balance is settled.";
    for (const event of pending) {
      await announce({
        event: event.type,
        memberId: charge.memberId,
        actorId: viewer._id,
        amountCents: event.amountCents,
        summary: event.summary,
        refs: { chargeId: charge._id },
        member: {
          template: event.type as NotifyTemplate,
          context: {
            // Signed in the ledger so a removal reads as negative; the member
            // is told "a $30 payment was removed", not "-$30".
            amountCents: Math.abs(Number(event.amountCents) || 0),
            description: charge.description,
            method: (event.meta as any)?.method,
            reason: String(body?.reason || ""),
            dueLabel: charge.dueDate
              ? new Date(charge.dueDate).toLocaleDateString("en-US", PHOENIX_DATE)
              : "",
            remainingLabel,
          },
        },
      });
    }

    logger.info({ chargeId: charge._id?.toString() }, "Dues charge updated");
    return NextResponse.json(serializeCharge(charge.toObject()), { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update dues charge");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// Voids a charge rather than erasing it.
///
/// This used to be a hard `findByIdAndDelete`, which took the charge and every
/// payment recorded against it with no trace that either existed. A ledger you
/// can silently delete rows from isn't one anybody should trust. `void` was
/// already in the status enum and `balanceCentsFor()` already zeroes anything
/// that isn't "open", so the member-facing behaviour is identical — the row
/// just survives to be explained later.
export async function DELETE(
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
    return NextResponse.json({ error: "Invalid charge id" }, { status: 400 });
  }

  try {
    await connectDB();
    const charge = await DuesCharge.findById(params.id);
    if (!charge) {
      return NextResponse.json({ error: "Charge not found" }, { status: 404 });
    }

    if (charge.status === "void") {
      return NextResponse.json(serializeCharge(charge.toObject()), { status: 200 });
    }

    const blocked = voidBlockedReason(charge);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 409 });
    }

    let reason = "";
    try {
      const body = await req.json();
      reason = String(body?.reason || "");
    } catch {
      // A bare DELETE with no body is fine; the reason is optional.
    }

    charge.status = "void";
    await charge.save();

    await recordFinanceEvent({
      memberId: charge.memberId,
      actorId: viewer._id,
      type: "charge_voided",
      amountCents: Number(charge.amountCents) || 0,
      summary: `Voided ${formatCents(Number(charge.amountCents) || 0)} for ${charge.description}`,
      refs: { chargeId: charge._id },
      meta: { reason, via: "DELETE" },
    });

    await announce({
      event: "charge_voided",
      memberId: charge.memberId,
      actorId: viewer._id,
      amountCents: Number(charge.amountCents) || 0,
      summary: `Voided ${formatCents(Number(charge.amountCents) || 0)} for ${charge.description}`,
      refs: { chargeId: charge._id },
      member: {
        template: "charge_voided",
        context: {
          amountCents: Number(charge.amountCents) || 0,
          description: charge.description,
          reason,
        },
      },
    });

    logger.info({ chargeId: params.id }, "Dues charge voided");
    return NextResponse.json(
      { ok: true, charge: serializeCharge(charge.toObject()) },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to void dues charge");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
