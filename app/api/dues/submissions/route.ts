// app/api/dues/submissions/route.ts
// A member reporting that they paid, and the officer-facing queue of claims
// waiting to be checked.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import { requireTreasury } from "@/lib/duesAuth";
import { balanceCentsFor } from "@/lib/models/DuesCharge";
import { readAmountCents, normalizeDueDate } from "@/lib/dues";
import { serializeSubmission, SUBMISSION_METHODS } from "@/lib/submissions";
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

/// The officer's approval queue.
export async function GET(req: Request) {
  try {
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const filter: any = {};
    const status = searchParams.get("status") ?? "pending";
    if (status !== "all") filter.status = status;

    const submissions = await PaymentSubmission.find(filter)
      // Oldest first: the queue is a backlog, and the person who has been
      // waiting longest is the one to deal with next.
      .sort({ submittedAt: 1 })
      .lean<any[]>();

    const memberIds = Array.from(
      new Set(submissions.map((s) => s.memberId?.toString()).filter(Boolean))
    );
    const chargeIds = Array.from(
      new Set(submissions.map((s) => s.chargeId?.toString()).filter(Boolean))
    );

    const [members, charges] = await Promise.all([
      Member.find({ _id: { $in: memberIds } })
        .select("rollNo fName lName")
        .lean<any[]>(),
      DuesCharge.find({ _id: { $in: chargeIds } })
        .select("description term amountCents payments status dueDate")
        .lean<any[]>(),
    ]);

    const memberById = new Map(members.map((m) => [m._id.toString(), m]));
    const chargeById = new Map(charges.map((c) => [c._id.toString(), c]));

    const rows = submissions.map((submission) => {
      const member = memberById.get(submission.memberId?.toString());
      const charge = chargeById.get(submission.chargeId?.toString());
      return {
        ...serializeSubmission(submission),
        member: member
          ? { rollNo: member.rollNo, fName: member.fName, lName: member.lName }
          : null,
        charge: charge
          ? {
              description: charge.description,
              term: charge.term,
              amountCents: charge.amountCents,
              balanceCents: balanceCentsFor(charge),
              dueDate: charge.dueDate
                ? new Date(charge.dueDate).toISOString()
                : null,
            }
          : null,
      };
    });

    return NextResponse.json(
      {
        submissions: rows,
        totals: {
          pendingCount: rows.filter((row) => row.status === "pending").length,
          pendingCents: rows
            .filter((row) => row.status === "pending")
            .reduce((sum, row) => sum + row.amountCents, 0),
          // How far behind the queue is running, in days. A treasurer who
          // can't see this has no way to know they're the bottleneck.
          oldestPendingDays: rows
            .filter((row) => row.status === "pending")
            .reduce((max, row) => Math.max(max, row.ageDays), 0),
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to list payment submissions");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// A member reporting a payment against one of their own charges.
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

    if (!mongoose.Types.ObjectId.isValid(String(body?.chargeId || ""))) {
      return NextResponse.json({ error: "Invalid chargeId" }, { status: 400 });
    }
    const charge = await DuesCharge.findById(body.chargeId).lean<any>();
    if (!charge) {
      return NextResponse.json({ error: "Charge not found" }, { status: 404 });
    }
    // A member may only ever claim against their own charge. Reading someone
    // else's balance through this route would be as bad as writing to it.
    if (charge.memberId?.toString() !== member._id.toString()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (charge.status !== "open") {
      return NextResponse.json(
        { error: `This charge is ${charge.status}, so nothing is owed on it` },
        { status: 409 }
      );
    }

    const amountCents = readAmountCents(body);
    if (amountCents === null || amountCents <= 0) {
      return NextResponse.json(
        { error: "amountCents (or amount, in dollars) must be greater than zero" },
        { status: 400 }
      );
    }

    // Overpayment is refused rather than clamped. `balanceCentsFor()` floors at
    // zero, so accepting more than is owed would silently swallow the excess —
    // and a member who overpaid and can't see where it went has every reason to
    // stop trusting the ledger.
    const outstanding = balanceCentsFor(charge);
    const claimedElsewhere = await PaymentSubmission.aggregate([
      {
        $match: {
          chargeId: charge._id,
          status: "pending",
        },
      },
      { $group: { _id: null, total: { $sum: "$amountCents" } } },
    ]);
    const alreadyClaimed = Number(claimedElsewhere?.[0]?.total) || 0;
    const claimable = outstanding - alreadyClaimed;

    if (claimable <= 0) {
      return NextResponse.json(
        {
          error:
            "You already have a payment claim covering this charge, waiting to be reviewed",
        },
        { status: 409 }
      );
    }
    if (amountCents > claimable) {
      return NextResponse.json(
        {
          error: `That's more than the ${formatCents(claimable)} still owed on this charge`,
          claimableCents: claimable,
        },
        { status: 400 }
      );
    }

    const method = SUBMISSION_METHODS.includes(body?.method)
      ? body.method
      : "other";

    // When they say the money moved, defaulting to today. Stored as a calendar
    // day for the same reason due dates are.
    const paidOn = body?.paidOn ? normalizeDueDate(body.paidOn) : normalizeDueDate(new Date());
    if (!paidOn) {
      return NextResponse.json({ error: "Invalid paidOn" }, { status: 400 });
    }
    // Claiming a payment for next week isn't a thing.
    if (paidOn.getTime() > Date.now() + 86400000) {
      return NextResponse.json(
        { error: "paidOn can't be in the future" },
        { status: 400 }
      );
    }

    const submission = await PaymentSubmission.create({
      memberId: member._id,
      chargeId: charge._id,
      planId: body?.planId ?? null,
      planSeq: body?.planSeq ?? null,
      amountCents,
      method,
      reference: String(body?.reference || ""),
      proofUrl: String(body?.proofUrl || ""),
      paidOn,
      submittedAt: new Date(),
      status: "pending",
    });

    await recordFinanceEvent({
      memberId: member._id,
      actorId: member._id,
      type: "payment_submitted",
      amountCents,
      summary: `Reported ${formatCents(amountCents)} paid by ${method} on ${paidOn.toLocaleDateString("en-US", PHOENIX_DATE)}`,
      refs: { chargeId: charge._id, submissionId: submission._id },
      meta: { method, reference: String(body?.reference || "") },
    });

    // Straight into the officer queue. Nothing goes to the member: they filed
    // it a second ago and the screen already told them so.
    await announce({
      event: "payment_submitted",
      memberId: member._id,
      actorId: member._id,
      amountCents,
      summary: `Reported ${formatCents(amountCents)} paid by ${method} on ${paidOn.toLocaleDateString("en-US", PHOENIX_DATE)}`,
      refs: { chargeId: charge._id, submissionId: submission._id },
    });

    logger.info(
      { submissionId: submission._id?.toString(), amountCents },
      "Payment submission filed"
    );
    return NextResponse.json(serializeSubmission(submission.toObject()), {
      status: 201,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to file payment submission");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
