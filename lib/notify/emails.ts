// lib/notify/emails.ts
// Getting member email addresses without asking Clerk sixty times.
//
// Clerk is the system of record for the address; Member is a cache of it. The
// alternative — one `clerkClient.users.getUser()` per recipient on every send —
// turns a chapter-wide reminder into sixty round trips and a rate limit.
import { clerkClient } from "@clerk/clerk-sdk-node";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

/// A cached address older than this is refreshed on the next send. Long enough
/// that a nightly cron doesn't re-fetch the chapter every night, short enough
/// that someone who changed their address gets the next reminder.
const STALE_AFTER_MS = 7 * 24 * 3600_000;

export interface EmailCacheReport {
  refreshed: number;
  missing: number;
}

/// Tops up the cached addresses for these members, then returns them.
///
/// Failures here are deliberately quiet: an email address we couldn't refresh
/// is a reason to send to the stale one, not a reason to cancel the reminder.
export async function ensureMemberEmails(
  memberIds: any[],
  now = new Date()
): Promise<EmailCacheReport> {
  if (!memberIds.length) return { refreshed: 0, missing: 0 };

  const stale = await Member.find({
    _id: { $in: memberIds },
    clerkId: { $type: "string" },
    $or: [
      { email: null },
      { emailSyncedAt: null },
      { emailSyncedAt: { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    ],
  })
    .select("_id clerkId rollNo")
    .lean<any[]>();

  if (!stale.length) return { refreshed: 0, missing: 0 };

  let refreshed = 0;
  let missing = 0;

  // Clerk's list endpoint takes a batch of ids, so this is one call per 100
  // members rather than one per member.
  const chunks: any[][] = [];
  for (let index = 0; index < stale.length; index += 100) {
    chunks.push(stale.slice(index, index + 100));
  }

  for (const chunk of chunks) {
    try {
      const users = await clerkClient.users.getUserList({
        userId: chunk.map((member) => member.clerkId),
        limit: 100,
      });
      const list: any[] = Array.isArray(users) ? users : (users as any)?.data ?? [];
      const byClerkId = new Map(list.map((user: any) => [user.id, user]));

      for (const member of chunk) {
        const user = byClerkId.get(member.clerkId);
        const address =
          user?.emailAddresses?.find(
            (entry: any) => entry.id === user.primaryEmailAddressId
          )?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          null;
        if (!address) {
          missing += 1;
          continue;
        }
        await Member.updateOne(
          { _id: member._id },
          { $set: { email: address, emailSyncedAt: now } }
        );
        refreshed += 1;
      }
    } catch (err: any) {
      logger.warn(
        { err, count: chunk.length },
        "Couldn't refresh member emails from Clerk — falling back to cached addresses"
      );
    }
  }

  return { refreshed, missing };
}
