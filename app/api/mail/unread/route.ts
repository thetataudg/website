// app/api/mail/unread/route.ts
// Unread inbox count for the nav badge, across every mailbox the member can
// open. Cheap on purpose: the navbar asks on every page, so anyone without a
// live mailbox just gets zero, not an error.
import { NextResponse } from "next/server";
import MailMessage from "@/lib/models/MailMessage";
import { accessibleMailboxes, currentMember, MailError } from "@/lib/mail/session";
import { syncReceivedMail } from "@/lib/mail/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await currentMember();
    const open = await accessibleMailboxes(member);
    if (!open.length) return NextResponse.json({ unread: 0 });
    await syncReceivedMail();
    const unread = await MailMessage.countDocuments({
      accountId: { $in: open.map((m) => m._id) },
      folder: "inbox",
      read: false,
    });
    return NextResponse.json({ unread });
  } catch (err) {
    // A refused session must stay a 401. Answering 200 with zero hid it from
    // the client's refresh-and-retry, so the badge dropped to nothing every
    // time the cookie lapsed instead of recovering.
    if (err instanceof MailError && err.statusCode === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ unread: 0 });
  }
}
