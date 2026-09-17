// app/api/mail/account/route.ts
// The signed-in member's chapter mailbox: its state, a request for one, and
// cancelling that request.
import { NextRequest, NextResponse } from "next/server";
import MailAccount from "@/lib/models/MailAccount";
import MailMessage from "@/lib/models/MailMessage";
import logger from "@/lib/logger";
import {
  ELIGIBLE_STATUSES,
  PERSONAL,
  accessibleMailboxes,
  currentMember,
  mailErrorResponse,
  requireMailbox,
  summarizeMailboxes,
} from "@/lib/mail/session";
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
    $or: [{ kind: "role" }, { memberId: { $ne: member._id } }],
  })
    .select("address")
    .lean<any[]>();
  const takenSet = new Set(taken.map((t) => t.address));
  return candidates.filter((c) => !takenSet.has(fullAddress(c))).slice(0, 4);
}

export async function GET() {
  try {
    const member = await currentMember();
    const account = await MailAccount.findOne({ memberId: member._id, ...PERSONAL }).lean<any>();
    const eligible = ELIGIBLE_STATUSES.includes(member.status);

    const payload: any = {
      domain: mailDomain(),
      eligible,
      member: { fName: member.fName, lName: member.lName },
      // Always the personal mailbox or request, which is what onboarding shows.
      account: toAccount(account),
    };

    if (!account || account.status === "rejected") {
      payload.suggestions = eligible ? await availableSuggestions(member) : [];
    }

    // Every mailbox they can open, with the one in use, for the switcher.
    const open = await accessibleMailboxes(member);
    if (open.length) {
      const { account: current } = await requireMailbox();
      const [summaries, unreadRows, budget] = await Promise.all([
        summarizeMailboxes(open),
        MailMessage.aggregate([
          { $match: { accountId: { $in: open.map((m) => m._id) }, folder: "inbox", read: false } },
          { $group: { _id: "$accountId", unread: { $sum: 1 } } },
        ]),
        sentToday(),
      ]);
      const unreadBy = new Map(unreadRows.map((r: any) => [String(r._id), r.unread]));
      payload.mailboxes = summaries.map((m) => ({ ...m, unread: unreadBy.get(m.id) ?? 0 }));
      payload.current = toAccount(current);
      payload.unread = unreadBy.get(String(current._id)) ?? 0;
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
    const existing = await MailAccount.findOne({ memberId: member._id, ...PERSONAL });
    if (existing && existing.status !== "rejected") {
      return NextResponse.json(
        {
          error:
            existing.status === "pending"
              ? "You already have a request in review."
              : existing.status === "revoked"
                ? "Your chapter mailbox was closed. Ask an officer to restore it."
                : "You already have a chapter mailbox.",
        },
        { status: 409 }
      );
    }
    if (await MailAccount.exists({ address, $or: [{ kind: "role" }, { memberId: { $ne: member._id } }] })) {
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
        : await MailAccount.create({ kind: "personal", memberId: member._id, ...fields });
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
    const removed = await MailAccount.findOneAndDelete({ memberId: member._id, ...PERSONAL, status: { $in: ["pending", "rejected"] } });
    if (!removed) return NextResponse.json({ error: "No request to cancel." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
