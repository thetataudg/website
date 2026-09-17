// lib/mail/sync.ts
// Catching up on received mail the webhook didn't deliver.
//
// The webhook is the fast path, but it only reaches the one server Resend is
// pointed at, and only when that server answers. A local dev server never
// hears it (the webhook points at production), and a production deploy that
// was restarting when mail arrived misses it too. So the mailbox also asks
// Resend what has come in lately and stores anything it doesn't have.
//
// Safe to run alongside the webhook: a message is unique per (Resend id,
// mailbox), so whichever gets there second is a no-op, and the push only goes
// out from the one that actually stored it.
import logger from "@/lib/logger";
import MailMessage from "@/lib/models/MailMessage";
import { listReceivedEmails, resendConfigured } from "@/lib/mail/resend";
import { bareAddress, isOurDomain } from "@/lib/mail/address";
import { copyAttachments, ingestReceivedEmail } from "@/lib/mail/ingest";

/// How often any one server asks Resend, however many tabs are open.
const MIN_INTERVAL_MS = 15_000;
/// Mail older than this is assumed to have been handled, or given up on.
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const state = globalThis as unknown as {
  __mailSync?: { lastRun: number; running: Promise<number> | null; seen: Set<string> };
};
/// `seen` holds emails already looked at that stored nothing: mail to an
/// address nobody has. Without it every pass would fetch them again.
const sync = (state.__mailSync ??= { lastRun: 0, running: null, seen: new Set() });

/// Stores any recent received mail that isn't in the database yet. Returns how
/// many emails were newly stored. Never throws.
export function syncReceivedMail(): Promise<number> {
  if (!resendConfigured()) return Promise.resolve(0);
  if (sync.running) return sync.running;
  if (Date.now() - sync.lastRun < MIN_INTERVAL_MS) return Promise.resolve(0);
  sync.lastRun = Date.now();

  sync.running = (async () => {
    try {
      const recent = (await listReceivedEmails(50)).filter((email) => {
        const created = email.created_at ? Date.parse(email.created_at) : Date.now();
        const ours = [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])]
          .map(bareAddress)
          .some((address) => address && isOurDomain(address));
        return ours && Date.now() - created < LOOKBACK_MS;
      });
      if (!recent.length) return 0;

      const known = new Set(
        (await MailMessage.distinct("resendEmailId", { resendEmailId: { $in: recent.map((e) => e.id) } })).map(String)
      );
      let stored = 0;
      // Oldest first, so conversations thread in the order they happened.
      for (const email of recent.filter((e) => !known.has(e.id) && !sync.seen.has(e.id)).reverse()) {
        try {
          const result = await ingestReceivedEmail(email.id, email);
          if (result.delivered) {
            stored += 1;
            await copyAttachments(email.id).catch(() => undefined);
          } else {
            sync.seen.add(email.id);
            if (sync.seen.size > 1000) sync.seen.clear();
          }
        } catch (err: any) {
          logger.warn({ err, emailId: email.id }, "Catch-up could not store a received email");
        }
      }
      if (stored) logger.info({ stored }, "Stored received mail the webhook missed");
      return stored;
    } catch (err: any) {
      logger.warn({ err }, "Received mail catch-up failed");
      return 0;
    } finally {
      sync.running = null;
    }
  })();
  return sync.running;
}
