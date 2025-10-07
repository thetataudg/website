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

// POST: Create a new vote (not started)
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
    // Only one open vote at a time
    const existing = await Vote.findOne({ ended: false });
    if (existing) {
      return NextResponse.json({ error: "A vote is already in progress" }, { status: 400 });
    }
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
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, voteId: vote._id }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create vote");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// DELETE: Delete the current vote
export async function DELETE(req: Request) {
  try {
    await requireECouncil(req);
    const vote = await Vote.findOneAndDelete({ ended: true });
    if (!vote) {
      return NextResponse.json({ error: "No ended vote to delete" }, { status: 404 });
    }
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
    const { action, countdown } = await req.json();
    const vote = await Vote.findOne({ ended: false });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No active vote to update" }, { status: 404 });
    }
    
    if (action === "start") {
      if (vote.started) return NextResponse.json({ error: "Vote already started" }, { status: 400 });
      vote.started = true;
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
    
    if (action === "nextRound" && vote.type === "Pledge" && vote.round === "board") {
      if (countdown && countdown > 0) {
        // Set end time for countdown before moving to next round
        const endTime = new Date(Date.now() + countdown * 1000);
        vote.endTime = endTime;
        await vote.save();
        
        // Schedule next round transition
        setTimeout(async () => {
          try {
            const currentVote = await Vote.findById(vote._id);
            if (currentVote && !currentVote.ended && currentVote.round === "board" && currentVote.endTime && new Date() >= currentVote.endTime) {
              currentVote.round = "blackball";
              currentVote.started = false;
              currentVote.endTime = null;
              await currentVote.save();
              logger.info({ voteId: vote._id }, "Vote automatically moved to next round after countdown");
            }
          } catch (error) {
            logger.error({ error, voteId: vote._id }, "Failed to auto-transition to next round after countdown");
          }
        }, countdown * 1000);
        
        return NextResponse.json({ success: true, endTime: endTime.toISOString(), action: "nextRound" });
      } else {
        // Move to next round immediately
        vote.round = "blackball";
        vote.started = false;
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

// GET: Get results of the vote
export async function GET(req: Request) {
  try {
    await requireECouncil(req);
    // Find the most recent vote (ended or not)
    const vote = await Vote.findOne({}).sort({ createdAt: -1 });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No vote found" }, { status: 404 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime && !vote.ended) {
      if (vote.type === "Pledge" && vote.round === "board") {
        // Auto-transition to next round
        vote.round = "blackball";
        vote.started = false;
        vote.endTime = null;
        await vote.save();
      } else {
        // Auto-end vote
        vote.ended = true;
        vote.endTime = null;
        await vote.save();
      }
    }
    
    if (vote.type === "Election") {
      // Tally results - exclude abstentions from option tallies
      const tally: Record<string, number> = {};
      for (const opt of vote.options) tally[opt] = 0;
      for (const v of vote.votes) {
        if (typeof v.choice === "string" && tally.hasOwnProperty(v.choice)) {
          tally[v.choice]++;
        }
        // Note: Abstain votes are ignored in tallying but still count toward totalVotes
      }
      return NextResponse.json({
        type: vote.type,
        title: vote.title,
        options: vote.options,
        started: vote.started,
        ended: vote.ended,
        endTime: vote.endTime?.toISOString() || null,
        results: tally,
        totalVotes: vote.votes.length, // This includes abstentions
      });
    } else if (vote.type === "Pledge") {
      // Board round results
      const boardResults: Record<string, { continue: number; board: number }> = {};
      const blackballResults: Record<string, { continue: number; blackball: number }> = {};
      for (const pledge of vote.pledges) {
        boardResults[pledge] = { continue: 0, board: 0 };
        blackballResults[pledge] = { continue: 0, blackball: 0 };
      }
      for (const v of vote.votes) {
        if (v.round === "board" && boardResults[v.pledge]) {
          if (v.choice === "Continue") boardResults[v.pledge].continue++;
          if (v.choice === "Board") boardResults[v.pledge].board++;
        }
        if (v.round === "blackball" && blackballResults[v.pledge]) {
          if (v.choice === "Continue") blackballResults[v.pledge].continue++;
          if (v.choice === "Blackball") blackballResults[v.pledge].blackball++;
        }
      }
      return NextResponse.json({
        type: vote.type,
        pledges: vote.pledges,
        started: vote.started,
        ended: vote.ended,
        round: vote.round,
        endTime: vote.endTime?.toISOString() || null,
        boardResults,
        blackballResults,
        totalVotes: vote.votes.length,
      });
    }
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote results");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}