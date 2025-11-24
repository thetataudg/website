import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import logger from "@/lib/logger";

// Helper to check E-Council
async function requireECouncil(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return member;
}

// POST: Create a new vote (suspended, not started)
export async function POST(req: Request) {
  try {
    await requireECouncil(req);
    const { type, options, pledges, title } = await req.json();
    if (type === "Election") {
      if (!Array.isArray(options) || options.length < 1) {
        return NextResponse.json({ error: "Invalid vote type or options" }, { status: 400 });
      }
    }
    if (type === "Pledge") {
      if (!Array.isArray(pledges) || pledges.length < 1) {
        return NextResponse.json({ error: "Invalid pledge list" }, { status: 400 });
      }
    }
    // Create vote in suspended state (started: false, ended: false)
    const vote = await Vote.create({
      type,
      title: type === "Election" ? title : undefined,
      options: type === "Election" ? options : [],
      pledges: type === "Pledge" ? pledges : [],
      round: type === "Pledge" ? "board" : undefined,
      started: false,
      ended: false,
      endTime: null,
      votes: [],
      removedOptions: [],
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, voteId: vote._id }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create vote");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// DELETE: Delete a specific vote by ID
export async function DELETE(req: Request) {
  try {
    await requireECouncil(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get('voteId');
    
    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }
    
    const vote = await Vote.findById(voteId);
    if (!vote) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    // Prevent deleting a running vote
    if (vote.started && !vote.ended) {
      return NextResponse.json({ error: "Cannot delete a running vote" }, { status: 400 });
    }
    
    await Vote.findByIdAndDelete(voteId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete vote");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// PATCH: Start, end, or next round
export async function PATCH(req: Request) {
  try {
    await requireECouncil(req);
    const { action, countdown, voteId } = await req.json();
    
    if (!voteId) {
      return NextResponse.json({ error: "voteId is required" }, { status: 400 });
    }
    
    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (action === "start") {
      if (vote.started) return NextResponse.json({ error: "Vote already started" }, { status: 400 });
      
      // Check if another vote is currently running
      const runningVote = await Vote.findOne({ started: true, ended: false });
      if (runningVote) {
        return NextResponse.json({ error: "Another vote is already running" }, { status: 400 });
      }
      
      vote.started = true;
      vote.startedAt = new Date(); // Set the start time
      vote.endTime = null; // Clear any existing end time
      await vote.save();
      return NextResponse.json({ success: true });
    }
    
    if (action === "end") {
      if (!vote.started) return NextResponse.json({ error: "Vote not started" }, { status: 400 });
      
      if (countdown && countdown > 0) {
        // Set end time for countdown
        const endTime = new Date(Date.now() + countdown * 1000);
        vote.endTime = endTime;
        await vote.save();
        
        // Schedule actual ending
        setTimeout(async () => {
          try {
            const currentVote = await Vote.findById(vote._id);
            if (currentVote && !currentVote.ended && currentVote.endTime && new Date() >= currentVote.endTime) {
              currentVote.ended = true;
              currentVote.endTime = null;
              await currentVote.save();
              logger.info({ voteId: vote._id }, "Vote automatically ended after countdown");
            }
          } catch (error) {
            logger.error({ error, voteId: vote._id }, "Failed to auto-end vote after countdown");
          }
        }, countdown * 1000);
        
        return NextResponse.json({ success: true, endTime: endTime.toISOString() });
      } else {
        // End immediately
        vote.ended = true;
        vote.endTime = null;
        await vote.save();
        return NextResponse.json({ success: true });
      }
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update vote");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// GET: Get results of a specific vote or list all votes
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get('voteId');
    
    // If no voteId, return list of all votes (oldest first, so new votes appear at bottom)
    // This endpoint is accessible to all authenticated members for proxy voting
    if (!voteId) {
      const clerkId = await requireAuth(req as any);
      await connectDB();
      const member = await Member.findOne({ clerkId }).lean();
      if (!member || Array.isArray(member)) {
        throw new Error("Not authorized");
      }
      
      const votes = await Vote.find({}).sort({ createdAt: 1 }).lean();
      return NextResponse.json({ 
        votes: votes.map(v => ({
          _id: v._id,
          type: v.type,
          title: v.title,
          started: v.started,
          ended: v.ended,
          createdAt: v.createdAt,
          voteCount: v.votes?.length || 0,
          hasVoted: v.votes?.some((vote: any) => vote.clerkId === clerkId) || false,
        }))
      });
    }
    
    // For specific vote results, require E-Council
    await requireECouncil(req);
    
    // Find specific vote
    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime && !vote.ended) {
      // Auto-end vote
      vote.ended = true;
      vote.endTime = null;
      await vote.save();
    }
    
    if (vote.type === "Election") {
      // Tally results - exclude abstentions, invalidated ballots, and votes for removed options
      const tally: Record<string, number> = {};
      for (const opt of vote.options) tally[opt] = 0;
      
      const validVotes = vote.votes.filter((v: any) => 
        !vote.invalidatedBallots?.includes(v.clerkId)
      );
      
      for (const v of validVotes) {
        // Only count votes for options that still exist (not removed)
        if (typeof v.choice === "string" && tally.hasOwnProperty(v.choice) && !vote.removedOptions?.includes(v.choice)) {
          tally[v.choice]++;
        }
        // Note: Abstain votes and votes for removed options are ignored in tallying but still count toward totalVotes
      }
      return NextResponse.json({
        type: vote.type,
        title: vote.title,
        options: vote.options,
        started: vote.started,
        ended: vote.ended,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        results: tally,
        totalVotes: validVotes.length, // This includes abstentions and removed option votes but excludes invalidated
        voterListVerified: vote.voterListVerified || false,
        removedOptions: vote.removedOptions || [],
      });
    } else if (vote.type === "Pledge") {
      // Filter out invalidated ballots
      const validVotes = vote.votes.filter((v: any) => 
        !vote.invalidatedBallots?.includes(v.clerkId)
      );
      
      // Board round results
      const boardResults: Record<string, { continue: number; board: number; invalidBoard?: boolean }> = {};
      const blackballResults: Record<string, { continue: number; blackball: number; invalidBlackball?: boolean }> = {};
      
      for (const pledge of vote.pledges) {
        const hasCon = vote.pledgeValidCons?.get(pledge) || false;
        boardResults[pledge] = { continue: 0, board: 0, invalidBoard: false };
        blackballResults[pledge] = { continue: 0, blackball: 0, invalidBlackball: false };
        
        // Check if there are any board/blackball votes for this pledge
        let hasBoardVote = false;
        let hasBlackballVote = false;
        
        for (const v of validVotes) {
          if (v.pledge === pledge) {
            if (v.round === "board") {
              if (v.choice === "Continue") boardResults[pledge].continue++;
              if (v.choice === "Board") {
                boardResults[pledge].board++;
                hasBoardVote = true;
              }
            }
            if (v.round === "blackball") {
              if (v.choice === "Continue") blackballResults[pledge].continue++;
              if (v.choice === "Blackball") {
                blackballResults[pledge].blackball++;
                hasBlackballVote = true;
              }
            }
          }
        }
        
        // Mark as invalid if they have board/blackball votes but no valid con
        if (hasBoardVote && !hasCon) {
          boardResults[pledge].invalidBoard = true;
        }
        if (hasBlackballVote && !hasCon) {
          blackballResults[pledge].invalidBlackball = true;
        }
      }
      
      return NextResponse.json({
        type: vote.type,
        pledges: vote.pledges,
        started: vote.started,
        ended: vote.ended,
        round: vote.round,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        boardResults,
        blackballResults,
        totalVotes: new Set(validVotes.filter((v: any) => v.round === "board").map((v: any) => v.clerkId)).size, // Count unique voters
        voterListVerified: vote.voterListVerified || false,
      });
    }
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote results");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}