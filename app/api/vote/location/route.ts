import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import VoteLocation from "@/lib/models/VoteLocation";
import logger from "@/lib/logger";
import { distanceMeters } from "@/lib/voteGeo";

/**
 * Where a vote's ballots came from, and which of them do not add up.
 *
 * Everything served here is unattributable by construction — see the comment
 * on the `VoteLocation` model for how, and why that took more than putting the
 * points in a different document. Nothing in this file loads a ballot, and
 * nothing joins a point to a member.
 */

async function requireVoteOfficer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) throw new Error("Not authorized");
  const isAdmin = member.role === "admin" || member.role === "superadmin";
  const position = (member.ecouncilPosition || "").toLowerCase();
  if (!isAdmin && !(position.includes("regent") || position.includes("scribe"))) {
    throw new Error("Not authorized - vote officers only");
  }
  return member;
}

/// Roughly a city block. Coarse enough that a cluster is a place rather than a
/// person's front door, which matters when the cluster has one ballot in it.
const CLUSTER_RADIUS_METERS = 120;

type Point = {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  proxy: boolean;
  distanceMeters: number | null;
  flagged: boolean;
  choices: string[];
};

/**
 * Greedy single-pass clustering.
 *
 * Not k-means: the question is "did most ballots come from one room", and the
 * answer wants groups defined by a real distance rather than by a count picked
 * in advance.
 */
function cluster(points: Point[]) {
  const clusters: {
    lat: number;
    lng: number;
    count: number;
    proxyCount: number;
    flaggedCount: number;
    members: Point[];
  }[] = [];

  for (const p of points) {
    const home = clusters.find(
      (c) => distanceMeters({ lat: c.lat, lng: c.lng }, p) <= CLUSTER_RADIUS_METERS
    );
    if (home) {
      home.members.push(p);
      home.count += 1;
      if (p.proxy) home.proxyCount += 1;
      if (p.flagged) home.flaggedCount += 1;
      // Re-centre on the running mean so the cluster tracks the group rather
      // than whichever ballot happened to land first.
      home.lat = home.members.reduce((s, m) => s + m.lat, 0) / home.members.length;
      home.lng = home.members.reduce((s, m) => s + m.lng, 0) / home.members.length;
    } else {
      clusters.push({
        lat: p.lat,
        lng: p.lng,
        count: 1,
        proxyCount: p.proxy ? 1 : 0,
        flaggedCount: p.flagged ? 1 : 0,
        members: [p],
      });
    }
  }

  return clusters
    .map((c) => ({
      lat: c.lat,
      lng: c.lng,
      count: c.count,
      proxyCount: c.proxyCount,
      flaggedCount: c.flaggedCount,
    }))
    .sort((a, b) => b.count - a.count);
}

// GET: the integrity picture for one vote
export async function GET(req: Request) {
  try {
    await requireVoteOfficer(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get("voteId");

    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }

    const vote = await Vote.findById(voteId).lean();
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    // Sorted by the random key, never by _id or insertion order — both of
    // those would hand back the points in the order the ballots arrived.
    const raw = await VoteLocation.find({ voteId })
      .sort({ shuffleKey: 1 })
      .select("lat lng accuracyMeters proxy distanceMeters flagged choices")
      .lean();

    const points: Point[] = raw.map((r: any) => ({
      lat: r.lat,
      lng: r.lng,
      accuracyMeters: r.accuracyMeters ?? null,
      proxy: !!r.proxy,
      distanceMeters: r.distanceMeters ?? null,
      flagged: !!r.flagged,
      choices: r.choices || [],
    }));

    const anchor =
      vote.votingLocation && Number.isFinite(vote.votingLocation.lat)
        ? {
            lat: vote.votingLocation.lat,
            lng: vote.votingLocation.lng,
            label: vote.votingLocation.label || null,
            radiusMeters: vote.votingLocation.radiusMeters || 200,
          }
        : null;

    const flagged = points.filter((p) => p.flagged);
    const proxied = points.filter((p) => p.proxy);
    const atAnchor = anchor
      ? points.filter(
          (p) => p.distanceMeters !== null && p.distanceMeters <= anchor.radiusMeters
        )
      : [];

    return NextResponse.json({
      voteId,
      anchor,
      // Ballots counted vs ballots that reported a position. A gap is not a
      // problem — a member can decline the permission and still vote — but the
      // officer reading this should know the map is not the whole tally.
      ballotCount: vote.votes?.length || 0,
      locatedCount: points.length,
      atAnchorCount: atAnchor.length,
      proxyCount: proxied.length,
      flaggedCount: flagged.length,
      clusters: cluster(points),
      points,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to load vote locations");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
