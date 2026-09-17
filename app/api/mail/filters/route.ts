// app/api/mail/filters/route.ts
// The signed-in member's filters, and creating one.
import { NextRequest, NextResponse } from "next/server";
import MailFilter from "@/lib/models/MailFilter";
import { mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { applyFilterToExisting, readFilterBody, toFilter } from "@/lib/mail/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { account } = await requireMailbox();
    const filters = await MailFilter.find({ accountId: account._id }).sort({ createdAt: 1 }).lean<any[]>();
    return NextResponse.json({ filters: filters.map(toFilter) });
  } catch (err) {
    return mailErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const body = await req.json().catch(() => ({}));
    const parsed = await readFilterBody(account._id, body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if ((await MailFilter.countDocuments({ accountId: account._id })) >= 100) {
      return NextResponse.json({ error: "You can have up to 100 filters." }, { status: 400 });
    }
    const filter = await MailFilter.create({ accountId: account._id, ...parsed });
    const applied = body?.applyToExisting
      ? await applyFilterToExisting(account._id, parsed.criteria, parsed.actions)
      : 0;
    return NextResponse.json({ filter: toFilter(filter), applied }, { status: 201 });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
