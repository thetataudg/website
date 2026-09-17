// app/api/mail/signatures/route.ts
// The signed-in member's signatures and signature defaults.
import { NextRequest, NextResponse } from "next/server";
import MailAccount from "@/lib/models/MailAccount";
import MailSignature from "@/lib/models/MailSignature";
import { isObjectId, mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { readSignatureBody, signaturePayload, toSignature } from "@/lib/mail/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { account } = await requireMailbox();
    return NextResponse.json(await signaturePayload(account));
  } catch (err) {
    return mailErrorResponse(err);
  }
}

/// Create a signature.
export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const parsed = readSignatureBody(await req.json().catch(() => ({})));
    if (parsed.error || !parsed.name) {
      return NextResponse.json({ error: parsed.error || "Give the signature a name." }, { status: 400 });
    }
    if ((await MailSignature.countDocuments({ accountId: account._id })) >= 20) {
      return NextResponse.json({ error: "You can have up to 20 signatures." }, { status: 400 });
    }
    try {
      const signature = await MailSignature.create({
        accountId: account._id,
        name: parsed.name,
        html: parsed.html ?? "",
        includeSeparator: parsed.includeSeparator ?? true,
      });
      // The first signature someone makes becomes their default, which is
      // what they almost always meant by making one.
      const current = await MailAccount.findById(account._id).select("defaultSignatureNew defaultSignatureReply").lean<any>();
      if (current && !current.defaultSignatureNew && !current.defaultSignatureReply
          && (await MailSignature.countDocuments({ accountId: account._id })) === 1) {
        await MailAccount.updateOne(
          { _id: account._id },
          { $set: { defaultSignatureNew: signature._id, defaultSignatureReply: signature._id } }
        );
      }
      return NextResponse.json({ signature: toSignature(signature), ...(await signaturePayload(account)) }, { status: 201 });
    } catch (err: any) {
      if (err?.code === 11000) return NextResponse.json({ error: "You already have a signature with that name." }, { status: 409 });
      throw err;
    }
  } catch (err) {
    return mailErrorResponse(err);
  }
}

/// Set the defaults. Either may be null for no signature.
export async function PUT(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    const body = await req.json().catch(() => ({}));
    const set: Record<string, any> = {};
    for (const [key, field] of [["newMail", "defaultSignatureNew"], ["reply", "defaultSignatureReply"]] as const) {
      if (body?.[key] === undefined) continue;
      if (body[key] === null) {
        set[field] = null;
      } else if (isObjectId(body[key]) && (await MailSignature.exists({ _id: body[key], accountId: account._id }))) {
        set[field] = body[key];
      } else {
        return NextResponse.json({ error: "That signature no longer exists." }, { status: 400 });
      }
    }
    if (Object.keys(set).length) await MailAccount.updateOne({ _id: account._id }, { $set: set });
    return NextResponse.json(await signaturePayload(account));
  } catch (err) {
    return mailErrorResponse(err);
  }
}
