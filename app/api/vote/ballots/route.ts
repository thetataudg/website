import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import VotePresence from "@/lib/models/VotePresence";
import logger from "@/lib/logger";

// Ballot review is available to E-Council and chapter administrators. This
// matches the voting workspace: admins can run a vote and must be able to
// verify its roll before the results they are allowed to read are unsealed.
async function requireBallotReviewer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  const isAdmin =
    !Array.isArray(member) &&
    (member?.role === "admin" || member?.role === "superadmin");
  if (!member || Array.isArray(member) || (!isAdmin && !member.isECouncil)) {
    throw new Error("Not authorized - E-Council or admin only");
  }
  return member;
}

// GET: Get list of all active members with their voting status
export async function GET(req: Request) {
  try {
    await requireBallotReviewer(req);
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get('voteId');
    
    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }
    
    // Get all active members
    const activeMembers = await Member.find({ status: "Active" })
      .select("clerkId fName lName rollNo")
      .sort({ lName: 1, fName: 1 })
      .lean();
    
    // Get the specified vote
    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    // Where each member voted from, and deliberately nothing about what they
    // chose — see `VotePresence`. This is the same class of fact as the roll's
    // own voted / proxy / no-ballot, which is why it can be shown beside a
    // name at all.
    const presence = await VotePresence.find({ voteId })
      .select("clerkId distanceMeters accuracyMeters outside")
      .lean();
    const presenceByMember = new Map<string, any>(
      presence.map((p: any) => [p.clerkId, p])
    );

    // The roll used to re-scan the whole `votes[]` array once per member,
    // which on a pledge vote is thousands of rows times the size of the
    // chapter. One pass, indexed by member, instead.
    const proxyVoters = new Set<string>();
    const submitters = new Set<string>();
    for (const v of vote.votes as any[]) {
      if (!v?.clerkId) continue;
      submitters.add(v.clerkId);
      if (v.proxy === true) proxyVoters.add(v.clerkId);
    }
    const invalidated = new Set<string>(vote.invalidatedBallots || []);

    // Build voter status for each member
    const voterList = activeMembers.map(member => {
      const isInvalidated = invalidated.has(member.clerkId);

      // Determine if any of the member's ballots are marked as proxy
      const hasProxy = proxyVoters.has(member.clerkId);

      // status can be 'voted', 'proxy', or 'no-ballot'
      let status: 'voted' | 'no-ballot' | 'proxy' = 'no-ballot';

      if (submitters.has(member.clerkId) && !isInvalidated) {
        // If any of the submitted ballots were proxy, mark as proxy
        status = hasProxy ? 'proxy' : 'voted';
      }

      const seen = presenceByMember.get(member.clerkId);

      return {
        clerkId: member.clerkId,
        name: `${member.fName} ${member.lName}`,
        rollNo: member.rollNo,
        status,
        isInvalidated,
        isProxy: hasProxy,
        // null when the member declined location, voted from the website
        // before this existed, or E-Council set no anchor to measure against.
        distanceMeters: seen?.distanceMeters ?? null,
        accuracyMeters: seen?.accuracyMeters ?? null,
        // Outside the boundary. An approved proxy is outside on purpose, so
        // the client pairs this with `isProxy` before calling it a problem.
        outsideBoundary: !!seen?.outside,
      };
    });

    return NextResponse.json({
      voterList,
      voteType: vote.type,
      voteEnded: vote.ended,
      voterListVerified: vote.voterListVerified || false,
      // So the roll can say "outside the 200 m boundary" rather than just
      // "outside", and can stay quiet when there is no boundary at all.
      anchor: vote.votingLocation?.lat != null
        ? {
            label: vote.votingLocation.label || null,
            radiusMeters: vote.votingLocation.radiusMeters || 200,
          }
        : null,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get voter list");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// POST: Invalidate a ballot
export async function POST(req: Request) {
  try {
    await requireBallotReviewer(req);
    const { clerkId, voteId } = await req.json();
    
    if (!clerkId || !voteId) {
      return NextResponse.json({ error: "clerkId and voteId are required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findById(voteId);
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (!vote.ended) {
      return NextResponse.json({ error: "Cannot invalidate ballots until vote has ended" }, { status: 400 });
    }
    
    // Prevent modifications after verification
    if (vote.voterListVerified) {
      return NextResponse.json({ error: "Cannot modify ballots after voter list has been verified" }, { status: 400 });
    }
    
    // Add to invalidated list if not already there
    if (!vote.invalidatedBallots) {
      vote.invalidatedBallots = [];
    }
    
    if (!vote.invalidatedBallots.includes(clerkId)) {
      vote.invalidatedBallots.push(clerkId);
      await vote.save();
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to invalidate ballot");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// DELETE: Remove a ballot from invalidated list (restore it)
export async function DELETE(req: Request) {
  try {
    await requireBallotReviewer(req);
    const { searchParams } = new URL(req.url);
    const clerkId = searchParams.get('clerkId');
    const voteId = searchParams.get('voteId');
    
    if (!clerkId || !voteId) {
      return NextResponse.json({ error: "clerkId and voteId are required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findById(voteId);
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    // Prevent modifications after verification
    if (vote.voterListVerified) {
      return NextResponse.json({ error: "Cannot modify ballots after voter list has been verified" }, { status: 400 });
    }
    
    // Remove from invalidated list
    if (vote.invalidatedBallots) {
      vote.invalidatedBallots = vote.invalidatedBallots.filter((id: string) => id !== clerkId);
      await vote.save();
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to restore ballot");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// PUT: Verify the voter list
export async function PUT(req: Request) {
  try {
    await requireBallotReviewer(req);
    const { voteId } = await req.json();
    
    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findById(voteId);
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (!vote.ended) {
      return NextResponse.json({ error: "Cannot verify voter list until vote has ended" }, { status: 400 });
    }
    
    // Prevent multiple verifications
    if (vote.voterListVerified) {
      return NextResponse.json({ error: "Voter list has already been verified and cannot be modified" }, { status: 400 });
    }
    
    // Mark voter list as verified
    vote.voterListVerified = true;
    await vote.save();
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to verify voter list");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
