// app/api/terminal/payments/[id]/route.ts
// Read one in-person payment, or decide whose money it was.
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import TerminalPayment from "@/lib/models/TerminalPayment";
import { requireTerminalOperator } from "@/lib/duesAuth";
import {
  assignTerminalPayment,
  serializeTerminalPayment,
  unassignTerminalPayment,
} from "@/lib/terminalPayments";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }
  await connectDB();
  const row = await TerminalPayment.findById(params.id).lean<any>();
  if (!row) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ payment: serializeTerminalPayment(row) });
}

/// Assign, reassign, or unassign.
///
/// None of this touches Stripe. The money moved when the card was tapped, and
/// everything here is the chapter deciding what it was for, which is a decision
/// it is allowed to change its mind about.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let viewer;
  try {
    viewer = await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }

  try {
    await connectDB();
    const body = await req.json();
    const row = await TerminalPayment.findById(params.id);
    if (!row) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (body?.unassign === true) {
      const { removedCents } = await unassignTerminalPayment({
        row,
        actorId: viewer._id,
      });
      return NextResponse.json({
        payment: serializeTerminalPayment(row),
        removedCents,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(String(body?.memberId))) {
      return NextResponse.json(
        { error: "Provide a memberId to assign this payment to, or unassign: true" },
        { status: 400 }
      );
    }
    const member = await Member.findById(body.memberId).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    let chargeId: any = null;
    if (body?.chargeId) {
      if (!mongoose.Types.ObjectId.isValid(String(body.chargeId))) {
        return NextResponse.json({ error: "Invalid chargeId" }, { status: 400 });
      }
      const charge = await DuesCharge.findById(body.chargeId).select("memberId").lean<any>();
      if (!charge) {
        return NextResponse.json({ error: "Charge not found" }, { status: 404 });
      }
      // Paying one member's charge with another member's money is never what
      // somebody meant to do, so it is refused rather than reconciled.
      if (String(charge.memberId) !== String(member._id)) {
        return NextResponse.json(
          { error: "That charge belongs to a different member" },
          { status: 409 }
        );
      }
      chargeId = charge._id;
    }

    const { reassignedFrom } = await assignTerminalPayment({
      row,
      memberId: member._id,
      chargeId,
      actorId: viewer._id,
      allowReassign: body?.reassign === true,
    });

    return NextResponse.json({
      payment: serializeTerminalPayment(row),
      reassignedFrom,
    });
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err, paymentId: params.id }, "Failed to assign a terminal payment");
    return NextResponse.json({ error: "Couldn't update the payment" }, { status: 500 });
  }
}
