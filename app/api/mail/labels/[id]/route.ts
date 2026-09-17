// app/api/mail/labels/[id]/route.ts
// Rename, recolor or delete one label. Deleting takes it off every message
// and every filter; the messages themselves stay where they are.
import { NextRequest, NextResponse } from "next/server";
import MailFilter from "@/lib/models/MailFilter";
import MailLabel from "@/lib/models/MailLabel";
import MailMessage from "@/lib/models/MailMessage";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { readLabelBody, toLabel } from "@/lib/mail/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const parsed = readLabelBody(await req.json().catch(() => ({})));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const set: Record<string, string> = {};
    if (parsed.name) set.name = parsed.name;
    if (parsed.color) set.color = parsed.color;
    if (parsed.icon) set.icon = parsed.icon;
    if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    try {
      const label = await MailLabel.findOneAndUpdate(
        { _id: params.id, accountId: account._id },
        { $set: set },
        { new: true }
      ).lean<any>();
      if (!label) return notFound();
      return NextResponse.json({ label: toLabel(label) });
    } catch (err: any) {
      if (err?.code === 11000) return NextResponse.json({ error: "You already have a label with that name." }, { status: 409 });
      throw err;
    }
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const removed = await MailLabel.findOneAndDelete({ _id: params.id, accountId: account._id }).lean<any>();
    if (!removed) return notFound();
    await Promise.all([
      MailMessage.updateMany({ accountId: account._id, labels: params.id }, { $pull: { labels: params.id } }),
      MailFilter.updateMany({ accountId: account._id, "actions.labelId": removed._id }, { $set: { "actions.labelId": null } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
