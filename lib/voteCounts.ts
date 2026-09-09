/**
 * How many people voted — which is not how many rows are in `votes[]`.
 *
 * A ballot is stored exploded: one row per member per subject per round. An
 * election is the only shape where that happens to be one row per member, so
 * `votes.length` read correctly there and silently lied everywhere else. A
 * pledge vote on ten pledges taken by twenty brothers writes four hundred
 * rows, and the list reported "400 ballots" for a room of twenty.
 *
 * Every count of turnout goes through here so the two shapes cannot drift
 * apart again.
 */
export function distinctVoterCount(
  votes: any[] | undefined | null,
  exclude?: string[] | null
): number {
  if (!Array.isArray(votes) || votes.length === 0) return 0;
  const struck = exclude && exclude.length ? new Set(exclude) : null;
  const seen = new Set<string>();
  for (const v of votes) {
    if (!v?.clerkId) continue;
    if (struck?.has(v.clerkId)) continue;
    seen.add(v.clerkId);
  }
  return seen.size;
}

/**
 * The same count as a Mongo aggregation expression, for the paths that must
 * never load `votes[]` into Node at all.
 *
 * `$setUnion` of one array is the idiomatic dedupe. Guarded with `$ifNull`
 * because a vote created before the field existed has no array to read.
 */
export const DISTINCT_VOTER_COUNT_EXPR = {
  $size: { $setUnion: [{ $ifNull: ["$votes.clerkId", []] }, []] },
};
