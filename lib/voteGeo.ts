import VoteLocation from "@/lib/models/VoteLocation";
import VotePresence from "@/lib/models/VotePresence";
import logger from "@/lib/logger";

export type BallotLocation = {
  lat: number;
  lng: number;
  accuracy?: number | null;
};

/**
 * Metres between two coordinates, great-circle.
 *
 * Haversine rather than an equirectangular approximation: the error of the
 * cheap version is small at chapter distances but this is also asked about
 * ballots cast from another state, where it is not.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_008.8; // IUGG mean Earth radius
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parses whatever the client sent, rejecting anything not a real coordinate. */
export function readBallotLocation(raw: any): BallotLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // 0,0 is Null Island — a real coordinate nobody votes from, and the value a
  // broken client sends when it has no fix.
  if (lat === 0 && lng === 0) return null;
  const accuracy = Number(raw.accuracy);
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
  };
}

/**
 * Records where a ballot came from, as two records that must never be joined.
 *
 * `VoteLocation` gets the coordinates and no member. `VotePresence` gets the
 * member and no coordinates — just how far from the anchor they were, which is
 * the only part an officer needs in order to ask somebody why they voted from
 * another city. See the note on `VotePresence` for why that split is the whole
 * design rather than an implementation detail.
 *
 * Deliberately best-effort: a failure here must never lose a ballot that has
 * already been counted. The audit trail is worth less than the vote.
 *
 * @param anchor the vote's `votingLocation`, if E-Council set one
 */
export async function recordBallotLocation(opts: {
  voteId: any;
  clerkId: string;
  location: BallotLocation | null;
  proxy: boolean;
  anchor?: { lat?: number; lng?: number; radiusMeters?: number } | null;
}): Promise<void> {
  const { voteId, clerkId, location, proxy, anchor } = opts;
  if (!location) return;

  try {
    const hasAnchor =
      anchor &&
      Number.isFinite(anchor.lat as number) &&
      Number.isFinite(anchor.lng as number);

    const distance = hasAnchor
      ? distanceMeters(
          { lat: anchor!.lat as number, lng: anchor!.lng as number },
          location
        )
      : null;

    const radius = Number(anchor?.radiusMeters) || 200;

    // A ballot is only worth flagging when the fix itself is tight enough to
    // mean something. A 400m accuracy circle 250m from the anchor is noise,
    // and an anonymous ballot flagged in error is one nobody can defend.
    const trustworthy =
      location.accuracy == null || location.accuracy <= Math.max(radius, 100);

    // The map's `flagged` keeps the accuracy guard below: it paints a red pin
    // on an anonymous point nobody can defend, so a loose fix should not earn
    // one. `outside` on the presence record is the plain geometric fact, with
    // the accuracy carried alongside it — a member 50 km away on a weak fix is
    // still 50 km away, and suppressing that here would have left the roll
    // reporting them as at the meeting. The roll hedges the wording instead.
    const outside = distance !== null && distance > radius;
    const flagged = outside && !proxy && trustworthy;
    const rounded = distance === null ? null : Math.round(distance);

    // No `choices` any more. Nothing ever rendered them, and once a member's
    // name sits on a distance in `VotePresence`, a matching distance on a
    // point that also carried choices would join the two back together and
    // publish how that member voted. The map wants positions, not ballots.
    await VoteLocation.create({
      voteId,
      lat: location.lat,
      lng: location.lng,
      accuracyMeters: location.accuracy ?? null,
      proxy,
      distanceMeters: rounded,
      flagged,
      dayKey: new Date().toISOString().slice(0, 10),
    });

    // Upserted rather than created: a client that retries a submission whose
    // ballot already landed must not leave two rows on one member.
    await VotePresence.updateOne(
      { voteId, clerkId },
      {
        $set: {
          distanceMeters: rounded,
          accuracyMeters: location.accuracy ?? null,
          outside,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    logger.error({ err, voteId }, "Failed to record ballot location");
  }
}

/**
 * The member's standing proxy request on a vote, if any.
 *
 * Mongoose subdocument arrays are plain arrays here; `.find` is enough.
 */
export function proxyRequestFor(vote: any, clerkId: string) {
  return (vote.proxyRequests || []).find((r: any) => r.clerkId === clerkId) || null;
}

/** True when this member has been cleared to cast a proxy ballot. */
export function hasApprovedProxy(vote: any, clerkId: string): boolean {
  return proxyRequestFor(vote, clerkId)?.status === "approved";
}
