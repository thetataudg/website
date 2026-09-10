// app/api/mail/account/route.ts
// The signed-in member's chapter mailbox: its state, a request for one, and
// cancelling that request.
import { NextRequest, NextResponse } from "next/server";
import MailAccount from "@/lib/models/MailAccount";
import MailMessage from "@/lib/models/MailMessage";
import logger from "@/lib/logger";
import { ELIGIBLE_STATUSES, currentMember, mailErrorResponse } from "@/lib/mail/session";
import { fullAddress, mailDomain, suggestLocalParts, validateLocalPart } from "@/lib/mail/address";
import { toAccount } from "@/lib/mail/serialize";
import { notifyOfficersOfMailRequest } from "@/lib/mail/notify";
import { sentToday } from "@/lib/mail/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function availableSuggestions(member: any): Promise<string[]> {
  const candidates = suggestLocalParts(member.fName, member.lName, member.gradYear);
  const taken = await MailAccount.find({
    address: { $in: candidates.map(fullAddress) },
    memberId: { $ne: member._id },
  })
    .select("address")
    .lean<any[]>();
  const takenSet = new Set(taken.map((t) => t.address));
  return candidates.filter((c) => !takenSet.has(fullAddress(c))).slice(0, 4);
}

export async function GET() {
  try {
    const member = await currentMember();
    const account = await MailAccount.findOne({ memberId: member._id }).lean<any>();
    const eligible = ELIGIBLE_STATUSES.includes(member.status);

    const payload: any = {
      domain: mailDomain(),
      eligible,
      member: { fName: member.fName, lName: member.lName },
      account: toAccount(account),
    };

    if (!account || account.status === "rejected") {
      payload.suggestions = eligible ? await availableSuggestions(member) : [];
    }
    if (account?.status === "active") {
      const [unread, budget] = await Promise.all([
        MailMessage.countDocuments({ accountId: account._id, folder: "inbox", read: false }),
        sentToday(),
      ]);
      payload.unread = unread;
      payload.budget = budget;
    }
    return NextResponse.json(payload);
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const member = await currentMember();
    if (!ELIGIBLE_STATUSES.includes(member.status)) {
      return NextResponse.json({ error: "Chapter mail isn't available for this account." }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const check = validateLocalPart(body?.localPart);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const address = fullAddress(check.localPart);
    const existing = await MailAccount.findOne({ memberId: member._id });
    if (existing && existing.status !== "rejected") {
      return NextResponse.json(
        { error: existing.status === "pending" ? "You already have a request in review." : "You already have a chapter mailbox." },
        { status: 409 }
      );
    }
    if (await MailAccount.exists({ address, memberId: { $ne: member._id } })) {
      return NextResponse.json({ error: "That address is taken." }, { status: 409 });
    }

    const fields = {
      address,
      localPart: check.localPart,
      displayName: `${member.fName} ${member.lName}`.trim(),
      status: "pending",
      requestedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      reviewComments: "",
    };
    let account;
    try {
      account = existing
        ? await MailAccount.findByIdAndUpdate(existing._id, { $set: fields }, { new: true })
        : await MailAccount.create({ memberId: member._id, ...fields });
    } catch (err: any) {
      if (err?.code === 11000) {
        return NextResponse.json({ error: "That address was just taken. Pick another." }, { status: 409 });
      }
      throw err;
    }

    logger.info({ memberId: String(member._id), address }, "Chapter mail requested");
    await notifyOfficersOfMailRequest(`${member.fName} ${member.lName}`.trim(), address).catch(() => undefined);
    return NextResponse.json({ account: toAccount(account) }, { status: 201 });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const member = await currentMember();
    const removed = await MailAccount.findOneAndDelete({ memberId: member._id, status: { $in: ["pending", "rejected"] } });
    if (!removed) return NextResponse.json({ error: "No request to cancel." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
