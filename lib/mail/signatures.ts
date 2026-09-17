// lib/mail/signatures.ts
// Shapes and checks shared by the signature routes.
import MailAccount from "@/lib/models/MailAccount";
import MailSignature from "@/lib/models/MailSignature";
import { sanitizeComposedHtml } from "@/lib/mail/content";

export function toSignature(s: any) {
  return {
    id: String(s._id),
    name: s.name,
    html: s.html || "",
    includeSeparator: s.includeSeparator !== false,
  };
}

export function readSignatureBody(body: any): { name?: string; html?: string; includeSeparator?: boolean; error?: string } {
  const out: { name?: string; html?: string; includeSeparator?: boolean; error?: string } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) return { error: "Give the signature a name." };
    out.name = name;
  }
  if (body?.html !== undefined) out.html = sanitizeComposedHtml(String(body.html).slice(0, 20_000));
  if (body?.includeSeparator !== undefined) out.includeSeparator = body.includeSeparator !== false;
  return out;
}

/// Every signature in the mailbox, plus which ones are the defaults.
export async function signaturePayload(account: any) {
  const [signatures, fresh] = await Promise.all([
    MailSignature.find({ accountId: account._id }).collation({ locale: "en", strength: 2 }).sort({ name: 1 }).lean<any[]>(),
    MailAccount.findById(account._id).select("defaultSignatureNew defaultSignatureReply").lean<any>(),
  ]);
  return {
    signatures: signatures.map(toSignature),
    defaults: {
      newMail: fresh?.defaultSignatureNew ? String(fresh.defaultSignatureNew) : null,
      reply: fresh?.defaultSignatureReply ? String(fresh.defaultSignatureReply) : null,
    },
  };
}
