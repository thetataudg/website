// app/api/donations/route.ts
// What the chapter has been given, for the treasury.
import { NextResponse } from "next/server";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Donation from "@/lib/models/Donation";
import { requireTreasury } from "@/lib/duesAuth";
import { donationTotals, serializeDonation } from "@/lib/donations";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // Reading what the chapter was given is E-Council business, not only the
    // Treasurer's. Taking a card is the narrow one; this is not.
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const filter: any = {};

    const status = searchParams.get("status");
    filter.status = status
      ? status
      : { $in: ["succeeded", "partially_refunded", "refunded", "disputed"] };

    const designation = searchParams.get("designation");
    if (designation) filter.designation = designation;

    const channel = searchParams.get("channel");
    if (channel) filter.channel = channel;

    if (searchParams.get("unacknowledged") === "true") {
      filter.acknowledgedAt = null;
    }

    const since = searchParams.get("since");
    if (since) {
      const date = new Date(since);
      if (!Number.isNaN(date.getTime())) filter.paidAt = { $gte: date };
    }

    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));
    const rows = await Donation.find(filter)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limit)
      .lean<any[]>();

    const memberIds = Array.from(
      new Set(rows.map((row) => row.donorMemberId).filter(Boolean).map(String))
    );
    const members = memberIds.length
      ? await Member.find({ _id: { $in: memberIds } })
          .select("rollNo fName lName status")
          .lean<any[]>()
      : [];
    const byId = new Map(members.map((m) => [String(m._id), m]));

    const donations = rows.map((row) => {
      const member = row.donorMemberId ? byId.get(String(row.donorMemberId)) : null;
      return {
        // The treasury sees the real name even on an anonymous gift, because
        // somebody has to be able to answer the bank. "Anonymous" is a promise
        // about publication, not about the chapter's own records.
        ...serializeDonation(row),
        member: member
          ? {
              rollNo: member.rollNo,
              fName: member.fName,
              lName: member.lName,
              status: member.status,
            }
          : null,
      };
    });

    return NextResponse.json({
      donations,
      totals: await donationTotals(),
      unacknowledgedCount: donations.filter(
        (row) => !row.acknowledgedAt && row.status === "succeeded"
      ).length,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to list donations");
    return NextResponse.json({ error: "Couldn't load donations" }, { status: 500 });
  }
}
