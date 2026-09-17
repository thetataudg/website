// lib/mail/roleMailboxes.ts
// Committee mailboxes: one per committee, held by whoever heads it.
//
// Reconciled rather than updated at each call site. A committee's head changes
// from the committee editor, from a member being marked Alumni, from the
// semester purge and from the iOS app, and every one of those would have to
// remember to move the mailbox. Instead this compares every committee with its
// mailbox and fixes whatever differs, so it is correct whichever path changed
// the head, and running it twice is harmless.
import logger from "@/lib/logger";
import Committee from "@/lib/models/Committee";
import MailAccount from "@/lib/models/MailAccount";
import { fullAddress, validateLocalPart } from "@/lib/mail/address";
import { notifyQuietly, recipientFor } from "@/lib/notify";

const state = globalThis as unknown as { __roleMailboxSync?: { indexed: boolean; lastRun: number; running: Promise<void> | null } };
const sync = (state.__roleMailboxSync ??= { indexed: false, lastRun: 0, running: null });

/// Before role mailboxes, `memberId` was unique across every mailbox, and a
/// committee head's personal and role mailboxes would collide on it. That old
/// index is replaced by one that only covers personal mailboxes. Existing rows
/// predate `kind`, so they are marked personal first, or the new index would
/// skip them and stop enforcing one personal mailbox per member.
async function ensureIndexes() {
  if (sync.indexed) return;
  await MailAccount.updateMany({ kind: { $exists: false } }, { $set: { kind: "personal" } });
  const indexes = await MailAccount.collection.indexes().catch(() => [] as any[]);
  const legacy = indexes.find((ix: any) => ix.name === "memberId_1" && ix.unique && !ix.partialFilterExpression);
  if (legacy) {
    await MailAccount.collection.dropIndex("memberId_1");
    logger.info("Replaced the one-mailbox-per-member index to allow committee mailboxes");
  }
  await MailAccount.syncIndexes().catch((err: any) => logger.warn({ err }, "Could not sync mail account indexes"));
  sync.indexed = true;
}

/// "Membership Integrity" → "membership-integrity", "R&D" → "r-and-d".
function localPartFor(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

/// The committee's own address if it is free and allowed, otherwise with
/// "-committee" and then a number on the end.
async function freeAddressFor(name: string): Promise<string | null> {
  const base = localPartFor(name) || "committee";
  const candidates = [base, `${base}-committee`.slice(0, 30), ...[2, 3, 4, 5].map((n) => `${base.slice(0, 27)}-${n}`)];
  for (const candidate of candidates) {
    const check = validateLocalPart(candidate);
    if (!check.ok) continue;
    const address = fullAddress(check.localPart);
    if (!(await MailAccount.exists({ address }))) return address;
  }
  return null;
}

export function roleDisplayName(committeeName: string): string {
  const name = String(committeeName || "").trim();
  return /committee$/i.test(name) ? name : `${name} Committee`;
}

async function tellNewHolder(memberId: any, address: string, committeeName: string) {
  const recipient = await recipientFor(memberId).catch(() => null);
  if (!recipient) return;
  const title = `You now manage ${address}`;
  const body = `As head of ${committeeName}, you can read and send from ${address}. Switch to it at the top of Chapter Mail.`;
  await notifyQuietly({
    recipient,
    template: "broadcast_mail_decision",
    context: {} as any,
    message: { title, body, push: body.slice(0, 178), emailSubject: title, link: "/member/mail", category: "mail" },
    channels: ["push"],
    audit: false,
  });
}

async function run() {
  await ensureIndexes();
  const [committees, mailboxes] = await Promise.all([
    Committee.find({}).select("name committeeHeadId").lean<any[]>(),
    MailAccount.find({ kind: "role" }).lean<any[]>(),
  ]);
  const byCommittee = new Map(mailboxes.map((m) => [String(m.committeeId), m]));

  for (const committee of committees) {
    const holder = committee.committeeHeadId ? String(committee.committeeHeadId) : null;
    const displayName = roleDisplayName(committee.name);
    const existing = byCommittee.get(String(committee._id));

    if (!existing) {
      const address = await freeAddressFor(committee.name);
      if (!address) {
        logger.warn({ committee: committee.name }, "No free address for a committee mailbox");
        continue;
      }
      try {
        await MailAccount.create({
          kind: "role",
          committeeId: committee._id,
          memberId: holder,
          address,
          localPart: address.split("@")[0],
          displayName,
          status: "active",
          requestedAt: new Date(),
          reviewedAt: new Date(),
          reviewedBy: "committee",
        });
        logger.info({ committee: committee.name, address }, "Committee mailbox created");
        if (holder) await tellNewHolder(holder, address, committee.name);
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // another server made it first
      }
      continue;
    }

    const currentHolder = existing.memberId ? String(existing.memberId) : null;
    const set: Record<string, any> = {};
    if (currentHolder !== holder) set.memberId = holder;
    if (existing.displayName !== displayName) set.displayName = displayName;
    // A mailbox closed only because its committee was gone comes back with it.
    if (existing.status === "suspended" && !existing.pausedByAdmin && existing.statusNote === "Committee deleted") {
      set.status = "active";
      set.statusNote = "";
    }
    if (!Object.keys(set).length) continue;

    await MailAccount.updateOne({ _id: existing._id }, { $set: set });
    if ("memberId" in set) {
      logger.info(
        { address: existing.address, from: currentHolder, to: holder },
        "Committee mailbox moved to the new head"
      );
      if (holder) await tellNewHolder(holder, existing.address, committee.name);
    }
  }

  // Committees that no longer exist: nobody holds their mailbox, and it stops
  // taking mail, but the mail it has is kept in case the committee returns.
  const live = new Set(committees.map((c) => String(c._id)));
  const orphans = mailboxes.filter((m) => !live.has(String(m.committeeId)) && (m.memberId || m.status === "active"));
  for (const orphan of orphans) {
    await MailAccount.updateOne(
      { _id: orphan._id },
      { $set: { memberId: null, status: "suspended", pausedByAdmin: false, statusNote: "Committee deleted" } }
    );
    logger.info({ address: orphan.address }, "Committee mailbox closed: its committee was deleted");
  }
}

/// Brings every committee mailbox in line with its committee. `force` skips the
/// throttle, for the routes that just changed a committee. Never throws.
export function syncCommitteeMailboxes(options: { force?: boolean } = {}): Promise<void> {
  if (sync.running) return sync.running;
  if (!options.force && Date.now() - sync.lastRun < 60_000) return Promise.resolve();
  sync.lastRun = Date.now();
  sync.running = run()
    .catch((err) => logger.warn({ err }, "Committee mailbox sync failed"))
    .finally(() => {
      sync.running = null;
    });
  return sync.running;
}
