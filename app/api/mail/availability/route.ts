// app/api/mail/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import MailAccount from "@/lib/models/MailAccount";
import { currentMember, mailErrorResponse } from "@/lib/mail/session";
import { fullAddress, validateLocalPart } from "@/lib/mail/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Is this address free for the signed-in member? Their own pending or
/// rejected request doesn't count against them.
export async function GET(req: NextRequest) {
  try {
    const member = await currentMember();
    const check = validateLocalPart(req.nextUrl.searchParams.get("local") || "");
    if (!check.ok) return NextResponse.json({ available: false, error: check.error });
    const address = fullAddress(check.localPart);
    const taken = await MailAccount.exists({ address, memberId: { $ne: member._id } });
    return NextResponse.json({
      available: !taken,
      address,
      error: taken ? "That address is taken." : null,
    });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
