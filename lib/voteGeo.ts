import VoteLocation from "@/lib/models/VoteLocation";
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
 * Records where a ballot came from, with nothing that identifies who cast it.
 *
 * Deliberately best-effort: a failure here must never lose a ballot that has
 * already been counted. The audit trail is worth less than the vote.
 *
 * @param anchor the vote's `votingLocation`, if E-Council set one
 */
export async function recordBallotLocation(opts: {
  voteId: any;
  location: BallotLocation | null;
  proxy: boolean;
  choices: string[];
  anchor?: { lat?: number; lng?: number; radiusMeters?: number } | null;
}): Promise<void> {
  const { voteId, location, proxy, choices, anchor } = opts;
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

    const flagged =
      distance !== null && !proxy && trustworthy && distance > radius;

    await VoteLocation.create({
      voteId,
      lat: location.lat,
      lng: location.lng,
      accuracyMeters: location.accuracy ?? null,
      proxy,
      choices,
      distanceMeters: distance === null ? null : Math.round(distance),
      flagged,
      dayKey: new Date().toISOString().slice(0, 10),
    });
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
