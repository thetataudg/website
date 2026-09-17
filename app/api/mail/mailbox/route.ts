// app/api/mail/mailbox/route.ts
// Switch which mailbox Chapter Mail is showing. Only a mailbox the member can
// open is accepted; the cookie is httpOnly so a page script can't aim it
// anywhere else either.
import { NextRequest, NextResponse } from "next/server";
import { MAILBOX_COOKIE, accessibleMailboxes, currentMember, isObjectId, mailErrorResponse } from "@/lib/mail/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const member = await currentMember();
    const body = await req.json().catch(() => ({}));
    const id = String(body?.mailboxId || "");
    const open = await accessibleMailboxes(member);
    if (!isObjectId(id) || !open.some((m) => String(m._id) === id)) {
      return NextResponse.json({ error: "You can't open that mailbox." }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(MAILBOX_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return mailErrorResponse(err);
  }
}
