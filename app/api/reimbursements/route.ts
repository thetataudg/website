// app/api/reimbursements/route.ts
// Members claiming money they fronted for the chapter, and the officer queue
// of claims waiting to be reviewed.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Reimbursement, {
  REIMBURSEMENT_CATEGORIES,
} from "@/lib/models/Reimbursement";
import { requireTreasury } from "@/lib/duesAuth";
import { normalizeDueDate, readAmountCents } from "@/lib/dues";
import { getDefaultSemesterRange } from "@/lib/gem";
import { serializeReimbursement } from "@/lib/reimbursements";
import { formatCents, recordFinanceEvent } from "@/lib/financeEvents";
import { announce } from "@/lib/notify/announce";
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
    const { searchParams } = new URL(req.url);

    // A member reading their own claims needs no treasury role.
    if (searchParams.get("mine") === "1") {
      const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
      if (!member) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      const mine = await Reimbursement.find({ memberId: member._id })
        .sort({ createdAt: -1 })
        .lean<any[]>();
      return NextResponse.json(
        { reimbursements: mine.map((r) => serializeReimbursement(r)) },
        { status: 200 }
      );
    }

    await requireTreasury(req);

    const filter: any = {};
    const status = searchParams.get("status") ?? "pending";
    if (status !== "all") filter.status = status;

    const reimbursements = await Reimbursement.find(filter)
      // Oldest first — someone who fronted their own money for the chapter is
      // out of pocket until this is dealt with.
      .sort({ createdAt: 1 })
      .lean<any[]>();

    const memberIds = Array.from(
      new Set(reimbursements.map((r) => r.memberId?.toString()).filter(Boolean))
    );
    const members = await Member.find({ _id: { $in: memberIds } })
      .select("rollNo fName lName")
      .lean<any[]>();
    const memberById = new Map(members.map((m) => [m._id.toString(), m]));

    const rows = reimbursements.map((reimbursement) => {
      const member = memberById.get(reimbursement.memberId?.toString());
      return {
        ...serializeReimbursement(reimbursement),
        member: member
          ? { rollNo: member.rollNo, fName: member.fName, lName: member.lName }
          : null,
      };
    });

    return NextResponse.json(
      {
        reimbursements: rows,
        totals: {
          pendingCount: rows.filter((row) => row.status === "pending").length,
          pendingCents: rows
            .filter((row) => row.status === "pending")
            .reduce((sum, row) => sum + row.amountCents, 0),
          oldestPendingDays: rows
            .filter((row) => row.status === "pending")
            .reduce((max, row) => Math.max(max, row.ageDays), 0),
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err }, "Failed to list reimbursements");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    const body = await req.json();

    const amountCents = readAmountCents(body);
    if (amountCents === null || amountCents <= 0) {
      return NextResponse.json(
        { error: "amountCents (or amount, in dollars) must be greater than zero" },
        { status: 400 }
      );
    }

    const description = String(body?.description || "").trim();
    if (!description) {
      return NextResponse.json(
        { error: "Say what the money was spent on" },
        { status: 400 }
      );
    }

    // No deadline of any kind here, deliberately — unlike paying dues, a
    // member who fronted their own money is owed it whenever they get round to
    // asking, and whether or not they currently owe the chapter anything.
    const purchasedOn = body?.purchasedOn
      ? normalizeDueDate(body.purchasedOn)
      : normalizeDueDate(new Date());
    if (!purchasedOn) {
      return NextResponse.json({ error: "Invalid purchasedOn" }, { status: 400 });
    }
    if (purchasedOn.getTime() > Date.now() + 86400000) {
      return NextResponse.json(
        { error: "purchasedOn can't be in the future" },
        { status: 400 }
      );
    }

    const category = REIMBURSEMENT_CATEGORIES.includes(body?.category)
      ? body.category
      : "other";

    const receiptUrls = Array.isArray(body?.receiptUrls)
      ? body.receiptUrls.map((url: any) => String(url)).filter(Boolean).slice(0, 8)
      : [];

    const reimbursement = await Reimbursement.create({
      memberId: member._id,
      term: String(body?.term || "").trim() || getDefaultSemesterRange().name,
      amountCents,
      description,
      category,
      purchasedOn,
      receiptUrls,
      status: "pending",
    });

    await recordFinanceEvent({
      memberId: member._id,
      actorId: member._id,
      type: "reimbursement_submitted",
      amountCents,
      summary: `Claimed ${formatCents(amountCents)} for ${description}`,
      refs: { reimbursementId: reimbursement._id },
      meta: { category, receiptCount: receiptUrls.length },
    });

    // The officers get a queue item; the member gets an acknowledgement that
    // it landed, because a claim for money you fronted is the one thing worth
    // confirming receipt of even though they just filed it themselves.
    await announce({
      event: "reimbursement_submitted",
      memberId: member._id,
      actorId: member._id,
      amountCents,
      summary: `Claimed ${formatCents(amountCents)} for ${description}`,
      refs: { reimbursementId: reimbursement._id },
      member: {
        template: "reimbursement_received",
        context: { amountCents, description },
      },
    });

    logger.info(
      { reimbursementId: reimbursement._id?.toString(), amountCents },
      "Reimbursement submitted"
    );
    return NextResponse.json(
      serializeReimbursement(reimbursement.toObject()),
      { status: 201 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to submit reimbursement");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
