// app/api/mail/signatures/[id]/route.ts
// Rename, edit or delete one signature. Deleting a default leaves that default
// as no signature.
import { NextRequest, NextResponse } from "next/server";
import MailAccount from "@/lib/models/MailAccount";
import MailSignature from "@/lib/models/MailSignature";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { readSignatureBody, signaturePayload, toSignature } from "@/lib/mail/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireMailbox();
    if (!isObjectId(params.id)) return notFound();
    const parsed = readSignatureBody(await req.json().catch(() => ({})));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const set: Record<string, string | boolean> = {};
    if (parsed.name) set.name = parsed.name;
    if (parsed.html !== undefined) set.html = parsed.html;
    if (parsed.includeSeparator !== undefined) set.includeSeparator = parsed.includeSeparator;
    if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    try {
      const signature = await MailSignature.findOneAndUpdate(
        { _id: params.id, accountId: account._id },
        { $set: set },
        { new: true }
      ).lean<any>();
      if (!signature) return notFound();
      return NextResponse.json({ signature: toSignature(signature), ...(await signaturePayload(account)) });
    } catch (err: any) {
      if (err?.code === 11000) return NextResponse.json({ error: "You already have a signature with that name." }, { status: 409 });
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
    const removed = await MailSignature.findOneAndDelete({ _id: params.id, accountId: account._id });
    if (!removed) return notFound();
    await Promise.all([
      MailAccount.updateOne({ _id: account._id, defaultSignatureNew: removed._id }, { $set: { defaultSignatureNew: null } }),
      MailAccount.updateOne({ _id: account._id, defaultSignatureReply: removed._id }, { $set: { defaultSignatureReply: null } }),
    ]);
    return NextResponse.json({ ok: true, ...(await signaturePayload(account)) });
  } catch (err) {
    return mailErrorResponse(err);
  }
}
