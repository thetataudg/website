// lib/mail/threading.ts
// Which conversation a message belongs to.
import { Types } from "mongoose";
import MailMessage from "@/lib/models/MailMessage";

export function normalizeSubject(subject: string): string {
  return String(subject || "")
    .replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function parseReferences(value: string): string[] {
  return (String(value || "").match(/<[^<>\s]+>/g) || []).slice(-20);
}

/// Headers first, because they are exact: a reply names the message it
/// answers. Falls back to a new thread rather than guessing by subject, since
/// two unrelated "Meeting tomorrow" emails merged into one conversation is a
/// worse bug than a reply that starts its own.
export async function resolveThreadId(
  accountId: any,
  inReplyTo: string,
  references: string[]
): Promise<string> {
  const ids = [inReplyTo, ...references].filter(Boolean);
  if (ids.length) {
    const parent = await MailMessage.findOne({ accountId, messageId: { $in: ids } })
      .select("threadId")
      .lean<any>();
    if (parent?.threadId) return parent.threadId;
  }
  return new Types.ObjectId().toString();
}
