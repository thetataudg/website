// lib/mail/session.ts
// Who is asking, and which mailbox is theirs.
//
// Every mail route resolves the mailbox here, from the signed-in session and
// nothing else. No route accepts a mailbox id from the client, so there is no
// parameter anyone could change to read somebody else's mail.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import MailAccount from "@/lib/models/MailAccount";
import { recordPresence } from "@/lib/presence";

export class MailError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const ELIGIBLE_STATUSES = ["Active", "Alumni"];

export async function currentMember() {
  const { userId } = await auth();
  if (!userId) throw new MailError(401, "Unauthorized");
  await connectDB();
  const member = await Member.findOne({ clerkId: userId });
  if (!member) throw new MailError(403, "Forbidden");
  await recordPresence(userId);
  return member;
}

/// The signed-in member's mailbox, only if it is live.
export async function requireMailbox() {
  const member = await currentMember();
  if (!ELIGIBLE_STATUSES.includes(member.status)) {
    throw new MailError(403, "Chapter mail isn't available for this account.");
  }
  const account = await MailAccount.findOne({ memberId: member._id, status: "active" });
  if (!account) throw new MailError(403, "You don't have a chapter mailbox yet.");
  return { member, account };
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
