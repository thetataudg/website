import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import logger from "@/lib/logger";
import {
  readBallotLocation,
  recordBallotLocation,
  hasApprovedProxy,
  proxyRequestFor,
} from "@/lib/voteGeo";
import { markEnded } from "@/lib/voteLifecycle";

// Helper to check active member
async function requireActiveMember(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return { member, clerkId };
}

// POST: Submit a vote
export async function POST(req: Request) {
  try {
    const { member, clerkId } = await requireActiveMember(req);
    const body = await req.json();
    const { voteId } = body;
    
    // If voteId provided, use it; otherwise find the running vote
    let vote;
    if (voteId) {
      vote = await Vote.findById(voteId);
    } else {
      // Find the currently running vote (started but not ended)
      vote = await Vote.findOne({ started: true, ended: false });
    }
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No active vote" }, { status: 404 });
    }
    
    // Check if vote has ended
    if (vote.ended) {
      return NextResponse.json({ error: "Vote has ended" }, { status: 400 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime) {
      // Auto-end vote
      vote.ended = true;
      vote.endTime = null;
      await markEnded(vote);
      await vote.save();
      return NextResponse.json({ error: "Vote has ended" }, { status: 400 });
    }
    
    // Where this ballot was cast from, and where the chapter said it should
    // be cast from. Both feed `audit` below, which writes the pair to a
    // separate, unattributable collection once the ballot itself is counted.
    const ballotLocation = readBallotLocation(body.location);
    const anchor =
      vote.votingLocation && Number.isFinite(vote.votingLocation.lat)
        ? vote.votingLocation
        : null;

    const audit = (isProxy: boolean, choices: string[]) =>
      recordBallotLocation({
        voteId: vote._id,
        location: ballotLocation,
        proxy: isProxy,
        choices,
        anchor,
      });

    // A proxy ballot is one the chapter agreed to in advance. Claiming the
    // flag without an approved request is refused rather than quietly counted,
    // because the flag is what stops the ballot being reviewed as an anomaly.
    const proxyRefusal = (isProxy: boolean) => {
      if (!isProxy) return null;
      if (hasApprovedProxy(vote, clerkId)) return null;
      const standing = proxyRequestFor(vote, clerkId);
      return NextResponse.json(
        {
          error:
            standing?.status === "pending"
              ? "Your proxy request is still waiting on E-Council."
              : standing?.status === "denied"
              ? "Your proxy request was denied."
              : "Proxy voting needs approval. Request one first.",
        },
        { status: 403 }
      );
    };
    
    if (vote.type === "Election") {
      const { choice, proxy } = body;
      // If the vote hasn't started, only allow submissions marked as proxy
      if (!vote.started && !proxy) {
        return NextResponse.json({ error: "Vote not started" }, { status: 400 });
      }
      const refused = proxyRefusal(!!proxy);
      if (refused) return refused;
      // Allow "Abstain" as a valid choice in addition to the defined options
      if (!vote.options.includes(choice) && choice !== "Abstain") {
        return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
      }
      
      // Use atomic update to prevent race condition (double voting)
      const result = await Vote.updateOne(
        {
          _id: vote._id,
          ended: false,
          "votes.clerkId": { $ne: clerkId } // Ensure clerkId not already in votes array
        },
        {
          $push: {
            votes: { clerkId, choice, proxy: !!proxy }
          }
        }
      );
      
      if (result.matchedCount === 0) {
        return NextResponse.json({ error: "Already voted or vote has ended" }, { status: 400 });
      }
      
      await audit(!!proxy, [choice]);
      return NextResponse.json({ success: true });
    } else if (vote.type === "Pledge") {
      // Support batch ballot submission with dual choices
      if (Array.isArray(body.ballot)) {
        const isProxy = !!body.proxy;
        // If vote hasn't started, only allow proxy submissions
        if (!vote.started && !isProxy) {
          return NextResponse.json({ error: "Vote not started" }, { status: 400 });
        }
        const refused = proxyRefusal(isProxy);
        if (refused) return refused;
        
        // Build array of all votes to insert
        const votesToInsert: any[] = [];
        
        for (const item of body.ballot) {
          const { pledge, boardChoice, blackballChoice } = item;
          if (!vote.pledges.includes(pledge)) {
            return NextResponse.json({ error: `Invalid pledge: ${pledge}` }, { status: 400 });
          }
          
          // Handle board choice
          if (boardChoice && boardChoice !== "Abstain") {
            const validBoardChoices = ["Continue", "Board"];
            if (!validBoardChoices.includes(boardChoice)) {
              return NextResponse.json({ error: `Invalid board choice for ${pledge}` }, { status: 400 });
            }
            votesToInsert.push({ clerkId, pledge, choice: boardChoice, round: "board", proxy: isProxy });
          } else {
            votesToInsert.push({ clerkId, pledge, choice: "Abstain", round: "board", proxy: isProxy });
          }
          
          // Handle blackball choice
          if (blackballChoice && blackballChoice !== "Abstain") {
            const validBlackballChoices = ["Continue", "Blackball"];
            if (!validBlackballChoices.includes(blackballChoice)) {
              return NextResponse.json({ error: `Invalid blackball choice for ${pledge}` }, { status: 400 });
            }
            votesToInsert.push({ clerkId, pledge, choice: blackballChoice, round: "blackball", proxy: isProxy });
          } else {
            votesToInsert.push({ clerkId, pledge, choice: "Abstain", round: "blackball", proxy: isProxy });
          }
        }
        
        // Use atomic update to prevent race condition
        // Check that none of the pledges have been voted on by this clerkId in board or blackball rounds
        const pledgeNames = body.ballot.map((b: any) => b.pledge);
        const result = await Vote.updateOne(
          {
            _id: vote._id,
            ended: false,
            $nor: [
              { "votes": { $elemMatch: { clerkId, pledge: { $in: pledgeNames }, round: "board" } } },
              { "votes": { $elemMatch: { clerkId, pledge: { $in: pledgeNames }, round: "blackball" } } }
            ]
          },
          {
            $push: {
              votes: { $each: votesToInsert }
            }
          }
        );
        
        if (result.matchedCount === 0) {
          return NextResponse.json({ error: "Already voted for one or more pledges or vote has ended" }, { status: 400 });
        }
        
        await audit(
          isProxy,
          votesToInsert.map((v) => `${v.pledge}: ${v.round} ${v.choice}`)
        );
        return NextResponse.json({ success: true });
      } else {
        // Fallback: single pledge vote (legacy)
        const { pledge, choice } = body;
        if (!vote.pledges.includes(pledge)) {
          return NextResponse.json({ error: "Invalid pledge" }, { status: 400 });
        }
        const validChoices = vote.round === "board" ? ["Continue", "Board"] : ["Continue", "Blackball"];
        if (!validChoices.includes(choice)) {
          return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
        }
        const isProxySingle = !!body.proxy;
        if (!vote.started && !isProxySingle) {
          return NextResponse.json({ error: "Vote not started" }, { status: 400 });
        }
        const refusedSingle = proxyRefusal(isProxySingle);
        if (refusedSingle) return refusedSingle;
        
        // Use atomic update to prevent race condition
        const result = await Vote.updateOne(
          {
            _id: vote._id,
            ended: false,
            "votes": { $not: { $elemMatch: { clerkId, pledge, round: vote.round } } }
          },
          {
            $push: {
              votes: { clerkId, pledge, choice, round: vote.round, proxy: isProxySingle }
            }
          }
        );
        
        if (result.matchedCount === 0) {
          return NextResponse.json({ error: "Already voted for this pledge this round or vote has ended" }, { status: 400 });
        }
        
        await audit(isProxySingle, [`${pledge}: ${vote.round} ${choice}`]);
        return NextResponse.json({ success: true });
      }
    } else if (vote.type === "Bidding") {
      // Support batch ballot submission for Bidding
      if (Array.isArray(body.ballot)) {
        const isProxy = !!body.proxy;
        // If vote hasn't started, only allow proxy submissions
        if (!vote.started && !isProxy) {
          return NextResponse.json({ error: "Vote not started" }, { status: 400 });
        }
        const refused = proxyRefusal(isProxy);
        if (refused) return refused;
        
        // Build array of all votes to insert
        const votesToInsert: any[] = [];
        
        for (const item of body.ballot) {
          const { rushee, choice } = item;
          if (!vote.rushees.includes(rushee)) {
            return NextResponse.json({ error: `Invalid rushee: ${rushee}` }, { status: 400 });
          }
          
          const validChoices = ["Bid", "No Bid", "Abstain"];
          if (!validChoices.includes(choice)) {
            return NextResponse.json({ error: `Invalid choice for ${rushee}` }, { status: 400 });
          }
          
          votesToInsert.push({ clerkId, rushee, choice, proxy: isProxy });
        }
        
        // Use atomic update to prevent race condition
        const rusheeNames = body.ballot.map((b: any) => b.rushee);
        const result = await Vote.updateOne(
          {
            _id: vote._id,
            ended: false,
            "votes": { $not: { $elemMatch: { clerkId, rushee: { $in: rusheeNames } } } }
          },
          {
            $push: {
              votes: { $each: votesToInsert }
            }
          }
        );
        
        if (result.matchedCount === 0) {
          return NextResponse.json({ error: "Already voted for one or more rushees or vote has ended" }, { status: 400 });
        }
        
        await audit(isProxy, votesToInsert.map((v) => `${v.rushee}: ${v.choice}`));
        return NextResponse.json({ success: true });
      }
    }
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to submit vote");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// GET: Get info about the current vote (not results)
export async function GET(req: Request) {
  try {
    const { member, clerkId } = await requireActiveMember(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get('voteId');
    
    let vote;
    if (voteId) {
      vote = await Vote.findById(voteId);
    } else {
      // Find running vote, or most recent ended vote, or any suspended vote
      vote = await Vote.findOne({ started: true, ended: false }) || 
             await Vote.findOne({ ended: true }).sort({ createdAt: -1 }) ||
             await Vote.findOne({ started: false, ended: false }).sort({ createdAt: -1 });
    }
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No vote found" }, { status: 404 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime && !vote.ended) {
      // Auto-end vote
      vote.ended = true;
      vote.endTime = null;
      await markEnded(vote);
      await vote.save();
    }
    
    // Carried on every shape of this response: the client needs the anchor to
    // explain *why* it is asking for a location, and its own proxy standing to
    // know whether the early ballot is unlocked.
    const standingProxy = proxyRequestFor(vote, clerkId);
    const common = {
      votingLocation: vote.votingLocation?.lat != null
        ? {
            lat: vote.votingLocation.lat,
            lng: vote.votingLocation.lng,
            label: vote.votingLocation.label || null,
            radiusMeters: vote.votingLocation.radiusMeters || 200,
          }
        : null,
      proxyStatus: standingProxy?.status || null,
      proxyReason: standingProxy?.reason || null,
      proxyDecisionNote: standingProxy?.decisionNote || null,
    };
    
    if (vote.type === "Election") {
      const hasVoted = vote.votes.some((v: any) => v.clerkId === clerkId);
      return NextResponse.json({
        _id: vote._id,
        type: vote.type,
        title: vote.title,
        options: vote.options,
        started: vote.started,
        ended: vote.ended,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        hasVoted,
        totalVotes: vote.votes.length,
        voterListVerified: vote.voterListVerified || false,
        ...common,
      });
    } else if (vote.type === "Pledge") {
      // For each pledge, check if user has voted in both rounds
      const votedPledges: Record<string, boolean> = {};
      const abstainedPledges: Record<string, boolean> = {};
      for (const pledge of vote.pledges) {
        const boardVote = vote.votes.find(
          (v: any) => v.clerkId === clerkId && v.pledge === pledge && v.round === "board"
        );
        const blackballVote = vote.votes.find(
          (v: any) => v.clerkId === clerkId && v.pledge === pledge && v.round === "blackball"
        );
        // Consider voted if they have votes in both rounds
        votedPledges[pledge] = !!(boardVote && blackballVote);
        abstainedPledges[pledge] = (boardVote?.choice === "Abstain" && blackballVote?.choice === "Abstain");
      }
      return NextResponse.json({
        _id: vote._id,
        type: vote.type,
        pledges: vote.pledges,
        started: vote.started,
        ended: vote.ended,
        round: vote.round,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        votedPledges,
        abstainedPledges,
        totalVotes: new Set(vote.votes.filter((v: any) => v.round === "board").map((v: any) => v.clerkId)).size, // Count unique voters
        voterListVerified: vote.voterListVerified || false,
        ...common,
      });
    } else if (vote.type === "Bidding") {
      // For each rushee, check if user has voted
      const votedRushees: Record<string, boolean> = {};
      const abstainedRushees: Record<string, boolean> = {};
      for (const rushee of vote.rushees) {
        const rusheeVote = vote.votes.find(
          (v: any) => v.clerkId === clerkId && v.rushee === rushee
        );
        votedRushees[rushee] = !!rusheeVote;
        abstainedRushees[rushee] = rusheeVote?.choice === "Abstain";
      }
      return NextResponse.json({
        _id: vote._id,
        type: vote.type,
        rushees: vote.rushees,
        snapBids: vote.snapBids || [],
        started: vote.started,
        ended: vote.ended,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        votedRushees,
        abstainedRushees,
        totalVotes: new Set(vote.votes.map((v: any) => v.clerkId)).size, // Count unique voters
        voterListVerified: vote.voterListVerified || false,
        ...common,
      });
    }
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote info");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}