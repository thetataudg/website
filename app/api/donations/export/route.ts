// app/api/donations/export/route.ts
// Every gift, as a spreadsheet.
import { NextResponse } from "next/server";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Donation from "@/lib/models/Donation";
import { requireTreasury } from "@/lib/duesAuth";
import { donationDesignationLabel } from "@/lib/donations";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Excel reads a leading =, +, - or @ as a formula, so a donor who typed one
/// into the message field would otherwise become an executable cell.
function csvCell(value: any): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const PHOENIX = { timeZone: "America/Phoenix" } as const;

export async function GET(req: Request) {
  try {
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const rows = await Donation.find({
      status: { $in: ["succeeded", "partially_refunded", "refunded", "disputed"] },
    })
      .sort({ paidAt: -1 })
      .lean<any[]>();

    const memberIds = Array.from(
      new Set(rows.map((row) => row.donorMemberId).filter(Boolean).map(String))
    );
    const members = memberIds.length
      ? await Member.find({ _id: { $in: memberIds } })
          .select("rollNo fName lName")
          .lean<any[]>()
      : [];
    const byId = new Map(members.map((m) => [String(m._id), m]));

    const header = [
      "Date",
      "Donor",
      "Roll number",
      "Email",
      "Amount",
      "Refunded",
      "Fund",
      "Channel",
      "Anonymous",
      "Thanked",
      "Message",
      "Stripe payment",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const row of rows) {
      const member = row.donorMemberId ? byId.get(String(row.donorMemberId)) : null;
      lines.push(
        [
          row.paidAt
            ? new Date(row.paidAt).toLocaleDateString("en-US", PHOENIX)
            : "",
          member ? `${member.fName} ${member.lName}` : row.donorName || "",
          member?.rollNo ?? "",
          row.donorEmail || "",
          ((Number(row.amountCents) || 0) / 100).toFixed(2),
          ((Number(row.refundedCents) || 0) / 100).toFixed(2),
          donationDesignationLabel(row.designation),
          row.channel ?? "",
          row.isAnonymous ? "yes" : "no",
          row.acknowledgedAt ? "yes" : "no",
          row.message || "",
          row.stripePaymentIntentId || "",
        ]
          .map(csvCell)
          .join(",")
      );
    }

    const stamp = new Date().toLocaleDateString("en-CA", PHOENIX);
    return new NextResponse(lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="donations-${stamp}.csv"`,
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to export donations");
    return NextResponse.json({ error: "Couldn't build that export" }, { status: 500 });
  }
}
