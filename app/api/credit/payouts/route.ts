// app/api/credit/payouts/route.ts
// Handing a member's credit back as actual money.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import { requireTreasury } from "@/lib/duesAuth";
import { creditBalanceCents, payOutCredit } from "@/lib/credit";
import { readAmountCents } from "@/lib/dues";
import { formatCents } from "@/lib/financeEvents";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = ["cash", "venmo", "zelle", "check", "other"];

export async function POST(req: Request) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    const body = await req.json();

    let memberId = body?.memberId;
    if (body?.rollNo && !memberId) {
      const target = await Member.findOne({ rollNo: String(body.rollNo) })
        .select("_id")
        .lean<any>();
      if (!target) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      memberId = target._id;
    }
    if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
      return NextResponse.json({ error: "Provide memberId or rollNo" }, { status: 400 });
    }

    const available = await creditBalanceCents(memberId);
    if (available <= 0) {
      return NextResponse.json(
        { error: "The chapter doesn't owe this member anything" },
        { status: 409 }
      );
    }

    // Defaults to clearing the whole balance, which is the common case; a
    // partial payout is the deliberate edit.
    const requested = readAmountCents(body);
    const amountCents = requested === null ? available : requested;
    if (amountCents <= 0) {
      return NextResponse.json(
        { error: "amountCents must be greater than zero" },
        { status: 400 }
      );
    }
    if (amountCents > available) {
      return NextResponse.json(
        {
          error: `That's more than the ${formatCents(available)} owed to this member`,
          availableCents: available,
        },
        { status: 400 }
      );
    }

    const method = METHODS.includes(body?.method) ? body.method : "other";

    await payOutCredit({
      memberId,
      amountCents,
      method,
      reference: String(body?.reference || ""),
      proofUrl: String(body?.proofUrl || ""),
      actorId: viewer._id,
      note: String(body?.note || ""),
    });

    const remaining = await creditBalanceCents(memberId);

    // The member's notice — money has physically left the chapter and should
    // be arriving — is sent by payOutCredit, alongside the officer copy, so
    // that any other caller of it tells them too.

    logger.info(
      { memberId: String(memberId), amountCents, remaining },
      "Credit paid out"
    );
    return NextResponse.json(
      { paidOutCents: amountCents, creditCents: remaining },
      { status: 201 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to pay out credit");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
