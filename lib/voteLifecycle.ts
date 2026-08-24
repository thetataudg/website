import VoteLocation from "@/lib/models/VoteLocation";

/**
 * What happens to a vote after the room has finished with it.
 *
 * Three stages, and only one of them is written down. A vote ends; it sits at
 * the top of the finished list for twenty minutes while the tally is read out
 * and argued about; then it archives itself and gets out of the way; then, a
 * month later, Mongo deletes it.
 *
 * The middle move is *derived* from `endedAt` on every read rather than being
 * written by a scheduled job. A job that has to fire to move a row between two
 * categories is a job that will eventually not fire, and the row will sit in
 * the wrong place forever. The last move is a TTL index, which is the same
 * argument taken to its conclusion: the database does it, so there is no cron
 * to keep alive.
 *
 * Lives here rather than in a route because three different paths close a vote
 * — the officer's button, the countdown's timer, and the lazy auto-end that any
 * read performs once `endTime` has passed — and a vote closed by one of them
 * has to age exactly like a vote closed by another.
 */

export const ARCHIVE_AFTER_MS = 20 * 60 * 1000;

export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/// Whether a vote counts as archived right now.
export function isArchived(vote: any, now = Date.now()): boolean {
  if (vote.archivedAt) return true;
  if (!vote.ended) return false;
  // A vote that ended before `endedAt` existed has no clock to run down, so it
  // reads as long since archived rather than as freshly finished.
  const endedAt = vote.endedAt ? new Date(vote.endedAt).getTime() : 0;
  return now - endedAt >= ARCHIVE_AFTER_MS;
}

/// Stamps the two dates a closed vote's whole life depends on.
export async function markEnded(vote: any): Promise<void> {
  // Idempotent: the lazy auto-end runs on every read of an expired vote, and
  // re-stamping would push the purge date a month further out each time.
  if (vote.endedAt) return;

  const endedAt = new Date();
  vote.endedAt = endedAt;
  vote.purgeAt = new Date(endedAt.getTime() + PURGE_AFTER_MS);

  // The ballots' locations expire with the ballots they describe.
  await VoteLocation.updateMany(
    { voteId: vote._id },
    { $set: { purgeAt: vote.purgeAt } }
  ).catch(() => undefined);
}
