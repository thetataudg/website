// app/api/mail/filters/[id]/route.ts
// Edit or delete one filter.
import { NextRequest, NextResponse } from "next/server";
import MailFilter from "@/lib/models/MailFilter";
import { applyFilterToExisting, readFilterBody, toFilter } from "@/lib/mail/filters";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const body = await req.json().catch(() => ({}));
    const parsed = await readFilterBody(account._id, body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const filter = await MailFilter.findOneAndUpdate(
      { _id: params.id, accountId: account._id },
      { $set: parsed },
      { new: true }
    ).lean<any>();
    if (!filter) return notFound();
    const applied = body?.applyToExisting
      ? await applyFilterToExisting(account._id, parsed.criteria, parsed.actions)
      : 0;
    return NextResponse.json({ filter: toFilter(filter), applied });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const removed = await MailFilter.findOneAndDelete({ _id: params.id, accountId: account._id });
    if (!removed) return notFound();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
