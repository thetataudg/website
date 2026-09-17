// lib/mail/snippets.ts
// Rewrites previews stored before quoted history was left out of them.
//
// Only rows that look like they carry a quote are touched, and only once per
// server start, so after the first pass this is one cheap query that finds
// nothing.
import logger from "@/lib/logger";
import MailMessage from "@/lib/models/MailMessage";
import { snippetOf } from "@/lib/mail/content";

const state = globalThis as unknown as { __snippetBackfill?: Promise<void> };

export function backfillQuotedSnippets(): Promise<void> {
  state.__snippetBackfill ??= (async () => {
    try {
      const rows = await MailMessage.find({ snippet: /\bwrote:|(^|\s)>\s/ })
        .select("text html snippet")
        .limit(5000)
        .lean<any[]>();
      const updates = rows
        .map((row) => ({ id: row._id, snippet: snippetOf(row.text || "", row.html || "") }))
        .filter((row, i) => row.snippet !== rows[i].snippet);
      if (!updates.length) return;
      await MailMessage.bulkWrite(
        updates.map((u) => ({ updateOne: { filter: { _id: u.id }, update: { $set: { snippet: u.snippet } } } }))
      );
      logger.info({ updated: updates.length }, "Rewrote message previews without quoted text");
    } catch (err: any) {
      logger.warn({ err }, "Could not rewrite message previews");
      state.__snippetBackfill = undefined;
    }
  })();
  return state.__snippetBackfill;
}
