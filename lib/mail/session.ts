// lib/mail/session.ts
// Who is asking, and which mailbox they are working in.
//
// A member may have several mailboxes: their own, and one for each committee
// they head. The one in use is named by the `chapter_mailbox` cookie, and is
// only honoured if it is one this member may open right now, so changing the
// cookie can't reach anyone else's mail. No route accepts a mailbox id from
// the request body.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import MailAccount from "@/lib/models/MailAccount";
import Committee from "@/lib/models/Committee";
import { recordPresence } from "@/lib/presence";
import { syncCommitteeMailboxes } from "@/lib/mail/roleMailboxes";

export class MailError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const ELIGIBLE_STATUSES = ["Active", "Alumni"];
export const MAILBOX_COOKIE = "chapter_mailbox";

/// A personal mailbox, from before `kind` existed or after.
export const PERSONAL = { kind: { $ne: "role" } };

export async function currentMember() {
  const { userId } = await auth();
  if (!userId) throw new MailError(401, "Unauthorized");
  await connectDB();
  const member = await Member.findOne({ clerkId: userId });
  if (!member) throw new MailError(403, "Forbidden");
  await recordPresence(userId);
  return member;
}

export interface MailboxSummary {
  id: string;
  address: string;
  displayName: string;
  kind: "personal" | "role";
  committeeName: string | null;
}

/// Every mailbox this member can open: their own, then their committees'.
export async function accessibleMailboxes(member: any) {
  if (!ELIGIBLE_STATUSES.includes(member.status)) return [];
  await syncCommitteeMailboxes();
  const accounts = await MailAccount.find({ memberId: member._id, status: "active" }).lean<any[]>();
  accounts.sort((a, b) => (a.kind === "role" ? 1 : 0) - (b.kind === "role" ? 1 : 0) || a.address.localeCompare(b.address));
  return accounts;
}

export async function summarizeMailboxes(accounts: any[]): Promise<MailboxSummary[]> {
  const committeeIds = accounts.filter((a) => a.committeeId).map((a) => a.committeeId);
  const committees = committeeIds.length
    ? await Committee.find({ _id: { $in: committeeIds } }).select("name").lean<any[]>()
    : [];
  const names = new Map(committees.map((c) => [String(c._id), c.name]));
  return accounts.map((a) => ({
    id: String(a._id),
    address: a.address,
    displayName: a.displayName || "",
    kind: a.kind === "role" ? "role" : "personal",
    committeeName: a.committeeId ? names.get(String(a.committeeId)) ?? null : null,
  }));
}

/// The mailbox being worked in: the cookie's choice when it is one of theirs,
/// otherwise their personal mailbox, otherwise their first committee's.
export async function requireMailbox() {
  const member = await currentMember();
  if (!ELIGIBLE_STATUSES.includes(member.status)) {
    throw new MailError(403, "Chapter mail isn't available for this account.");
  }
  const mailboxes = await accessibleMailboxes(member);
  if (!mailboxes.length) throw new MailError(403, "You don't have a chapter mailbox yet.");
  const wanted = cookies().get(MAILBOX_COOKIE)?.value;
  const chosen =
    mailboxes.find((m) => String(m._id) === wanted) ??
    mailboxes.find((m) => m.kind !== "role") ??
    mailboxes[0];
  const account = await MailAccount.findById(chosen._id);
  if (!account) throw new MailError(403, "You don't have a chapter mailbox yet.");
  return { member, account, mailboxes };
}

export function mailErrorResponse(err: any) {
  const status = err?.statusCode || 500;
  return NextResponse.json(
    { error: status === 500 ? "Something went wrong." : err.message },
    { status }
  );
}

export function isObjectId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value || ""));
}
