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
  references: string[],
  fallback?: { subject: string; participants: string[] }
): Promise<string> {
  const ids = [inReplyTo, ...references].filter(Boolean);
  if (ids.length) {
    const parent = await MailMessage.findOne({ accountId, messageId: { $in: ids } })
      .select("threadId")
      .lean<any>();
    if (parent?.threadId) return parent.threadId;
  }

  // The headers named a message we don't have under that id. That happens
  // when the sending service rewrites the Message-ID on the way out, so a
  // reply to our own mail names an id we never saw. Gmail groups these by
  // subject and people, and so do we, but only for something that is plainly
  // a reply (it carries reply headers or a Re:/Fwd: prefix) and only with
  // somebody already in the conversation, within the last 60 days. That keeps
  // two unrelated "Meeting tomorrow" emails apart.
  const looksLikeReply = ids.length > 0 || /^\s*(re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:/i.test(fallback?.subject || "");
  const subject = normalizeSubject(fallback?.subject || "");
  const people = (fallback?.participants ?? []).map((p) => p.toLowerCase()).filter(Boolean);
  if (looksLikeReply && subject && people.length) {
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const candidates = await MailMessage.find({
      accountId,
      folder: { $ne: "drafts" },
      date: { $gte: since },
      $or: [{ from: { $in: people } }, { to: { $in: people } }, { cc: { $in: people } }],
    })
      .sort({ date: -1 })
      .limit(200)
      .select("threadId subject")
      .lean<any[]>();
    const match = candidates.find((c) => normalizeSubject(c.subject) === subject);
    if (match?.threadId) return match.threadId;
  }
  return new Types.ObjectId().toString();
}
