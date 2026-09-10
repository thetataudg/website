// app/api/mail/requests/[id]/route.ts
// Approve or deny a chapter email request.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import MailAccount from "@/lib/models/MailAccount";
import Member from "@/lib/models/Member";
import { fullAddress, validateLocalPart } from "@/lib/mail/address";
import { isObjectId, ELIGIBLE_STATUSES } from "@/lib/mail/session";
import { sendMailDecisionEmail } from "@/lib/mail/decisionEmail";
import { notifyMailDecision } from "@/lib/mail/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let admin: any;
  try {
    await connectDB();
    admin = await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }

  if (!isObjectId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const comments = String(body?.reviewComments || "").trim().slice(0, 1000);

  const account = await MailAccount.findOne({ _id: params.id, status: "pending" });
  if (!account) return NextResponse.json({ error: "This request was already handled." }, { status: 404 });
  const member = await Member.findById(account.memberId).select("fName lName clerkId status").lean<any>();
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (action === "approve") {
    if (!ELIGIBLE_STATUSES.includes(member.status)) {
      return NextResponse.json({ error: `Members marked ${member.status} can't have a chapter mailbox.` }, { status: 400 });
    }
    // The reviewer may correct the address before approving.
    if (body?.localPart !== undefined && String(body.localPart).trim().toLowerCase() !== account.localPart) {
      const check = validateLocalPart(body.localPart);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      const address = fullAddress(check.localPart);
      if (await MailAccount.exists({ address, _id: { $ne: account._id } })) {
        return NextResponse.json({ error: "That address is taken." }, { status: 409 });
      }
      account.localPart = check.localPart;
      account.address = address;
    }
    account.status = "active";
  } else {
    account.status = "rejected";
  }
  account.reviewedBy = admin.clerkId;
  account.reviewedAt = new Date();
  account.reviewComments = comments;
  try {
    await account.save();
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: "That address is taken." }, { status: 409 });
    throw err;
  }

  const decision = action === "approve" ? "approved" : "rejected";
  logger.info({ accountId: String(account._id), address: account.address, decision, reviewedBy: admin.clerkId }, "Chapter mail request reviewed");

  const [emailed] = await Promise.all([
    sendMailDecisionEmail({
      clerkId: member.clerkId,
      firstName: member.fName,
      decision,
      address: account.address,
      comments,
    }),
    notifyMailDecision(account.memberId, decision, account.address).catch(() => undefined),
  ]);

  return NextResponse.json({ status: decision, address: account.address, emailed });
}
