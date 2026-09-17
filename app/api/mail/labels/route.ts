// app/api/mail/labels/route.ts
// The signed-in member's labels, and making a new one.
import { NextRequest, NextResponse } from "next/server";
import MailLabel from "@/lib/models/MailLabel";
import { mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { readLabelBody, toLabel } from "@/lib/mail/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { account } = await requireMailbox();
    const labels = await MailLabel.find({ accountId: account._id })
      .collation({ locale: "en", strength: 2 })
      .sort({ name: 1 })
      .lean<any[]>();
    return NextResponse.json({ labels: labels.map(toLabel) });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const parsed = readLabelBody(await req.json().catch(() => ({})));
    if (parsed.error || !parsed.name) {
      return NextResponse.json({ error: parsed.error || "Give the label a name." }, { status: 400 });
    }
    if ((await MailLabel.countDocuments({ accountId: account._id })) >= 100) {
      return NextResponse.json({ error: "You can have up to 100 labels." }, { status: 400 });
    }
    try {
      const label = await MailLabel.create({
        accountId: account._id,
        name: parsed.name,
        color: parsed.color || "gray",
        icon: parsed.icon || "tag",
      });
      return NextResponse.json({ label: toLabel(label) }, { status: 201 });
    } catch (err: any) {
      if (err?.code === 11000) return NextResponse.json({ error: "You already have a label with that name." }, { status: 409 });
      throw err;
    }
  } catch (err) {
    return mailErrorResponse(err);
  }
}
