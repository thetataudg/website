// app/api/members/pending/count/route.ts
// How many requests are waiting in the admin queue: account access, account
// deletion and chapter email together. Drives the badge on the Requests tab
// and the dot on Admin in the navbar.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import MailAccount from "@/lib/models/MailAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }
  const [members, mail] = await Promise.all([
    PendingMember.countDocuments({ status: "pending" }),
    MailAccount.countDocuments({ status: "pending" }),
  ]);
  return NextResponse.json({ count: members + mail });
}
