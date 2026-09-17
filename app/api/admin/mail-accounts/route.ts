// app/api/admin/mail-accounts/route.ts
// Every chapter mailbox that has been handed out, for the admin console's
// Email tab. Requests still waiting on review live in the Requests queue, and
// denied ones were never mailboxes, so neither is listed here.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import MailAccount from "@/lib/models/MailAccount";
import MailMessage from "@/lib/models/MailMessage";
import Committee from "@/lib/models/Committee";
import { syncCommitteeMailboxes } from "@/lib/mail/roleMailboxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }

  try {
    await syncCommitteeMailboxes({ force: true });
    const accounts = await MailAccount.find({ status: { $in: ["active", "suspended", "revoked"] } })
      .sort({ address: 1 })
      .populate("memberId", "rollNo fName lName status")
      .lean<any[]>();

    const counts = await MailMessage.aggregate([
      { $match: { accountId: { $in: accounts.map((a) => a._id) } } },
      {
        $group: {
          _id: "$accountId",
          total: { $sum: 1 },
          lastAt: { $max: "$date" },
        },
      },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c]));
    const committees = await Committee.find({ _id: { $in: accounts.map((a) => a.committeeId).filter(Boolean) } })
      .select("name")
      .lean<any[]>();
    const committeeName = new Map(committees.map((c) => [String(c._id), c.name]));

    return NextResponse.json({
      accounts: accounts.map((a) => {
        const count = countById.get(String(a._id));
        return {
          id: String(a._id),
          address: a.address,
          displayName: a.displayName || "",
          status: a.status as "active" | "suspended" | "revoked",
          kind: a.kind === "role" ? "role" : "personal",
          committeeName: a.committeeId ? committeeName.get(String(a.committeeId)) ?? null : null,
          pausedByAdmin: Boolean(a.pausedByAdmin),
          statusNote: a.statusNote || "",
          statusChangedAt: a.statusChangedAt ? new Date(a.statusChangedAt).toISOString() : null,
          approvedAt: a.reviewedAt ? new Date(a.reviewedAt).toISOString() : null,
          messageCount: count?.total ?? 0,
          lastMessageAt: count?.lastAt ? new Date(count.lastAt).toISOString() : null,
          member: a.memberId
            ? {
                id: String(a.memberId._id),
                rollNo: a.memberId.rollNo,
                name: `${a.memberId.fName ?? ""} ${a.memberId.lName ?? ""}`.trim(),
                status: a.memberId.status,
              }
            : null,
        };
      }),
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to list chapter mailboxes");
    return NextResponse.json({ error: "Couldn't load chapter mailboxes." }, { status: 500 });
  }
}
