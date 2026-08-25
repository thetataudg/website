// app/api/dues/export/route.ts
// Everything the term's audit needs, in one response.
//
// Returns data rather than a file: the PDF is drawn in the browser with jspdf,
// which is already a dependency, and generating it server-side would mean
// shipping a second renderer for no gain.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor, paidCentsFor } from "@/lib/models/DuesCharge";
import FinanceEvent from "@/lib/models/FinanceEvent";
import { requireTreasury } from "@/lib/duesAuth";
import { creditBalancesFor } from "@/lib/credit";
import { serializeEvent, AuditExportRow } from "@/lib/financeHistory";
import { getDefaultSemesterRange, parseSemesterName } from "@/lib/gem";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const term = searchParams.get("term") || getDefaultSemesterRange().name;
    const range = parseSemesterName(term) ?? getDefaultSemesterRange();

    const charges = await DuesCharge.find({ term }).lean<any[]>();
    const memberIds = Array.from(
      new Set(charges.map((charge) => charge.memberId?.toString()).filter(Boolean))
    );

    const [members, credits, events] = await Promise.all([
      Member.find({
        $or: [{ _id: { $in: memberIds } }, { status: "Active" }],
      })
        .select("rollNo fName lName status")
        .lean<any[]>(),
      creditBalancesFor(memberIds),
      // Chronological, because an audit is read forwards.
      FinanceEvent.find({
        occurredAt: { $gte: range.startDate, $lte: range.endDate },
      })
        .sort({ occurredAt: 1 })
        .limit(2000)
        .populate("actorId", "rollNo fName lName")
        .lean<any[]>(),
    ]);

    const byMember = new Map<string, any[]>();
    for (const charge of charges) {
      const key = charge.memberId?.toString();
      if (!key) continue;
      if (!byMember.has(key)) byMember.set(key, []);
      byMember.get(key)!.push(charge);
    }

    const rows: AuditExportRow[] = members
      .map((member) => {
        const own = byMember.get(member._id.toString()) ?? [];
        const live = own.filter((charge) => charge.status !== "void");
        const assignedCents = live.reduce(
          (sum, charge) => sum + (Number(charge.amountCents) || 0),
          0
        );
        const paid = live.reduce((sum, charge) => sum + paidCentsFor(charge), 0);
        const balance = live.reduce((sum, charge) => sum + balanceCentsFor(charge), 0);
        return {
          rollNo: member.rollNo ?? "Unknown",
          name: `${member.fName ?? ""} ${member.lName ?? ""}`.trim(),
          assignedCents,
          paidCents: paid,
          balanceCents: balance,
          creditCents: credits.get(member._id.toString()) ?? 0,
          status: member.status ?? "Active",
        };
      })
      // Somebody with no charges and no credit this term isn't part of the
      // term's ledger and would just pad the report.
      .filter((row) => row.assignedCents > 0 || row.creditCents > 0)
      .sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name));

    return NextResponse.json(
      {
        term,
        generatedAt: new Date().toISOString(),
        rows,
        totals: {
          assignedCents: rows.reduce((sum, row) => sum + row.assignedCents, 0),
          paidCents: rows.reduce((sum, row) => sum + row.paidCents, 0),
          outstandingCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
          creditOwedCents: rows.reduce((sum, row) => sum + row.creditCents, 0),
          memberCount: rows.length,
          settledCount: rows.filter((row) => row.balanceCents === 0).length,
        },
        timeline: events.map(serializeEvent),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to build the dues export");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
