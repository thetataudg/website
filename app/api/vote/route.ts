import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import logger from "@/lib/logger";

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
    const vote = await Vote.findOne({ ended: false });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No active vote" }, { status: 404 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime) {
      // Auto-end vote
      vote.ended = true;
      vote.endTime = null;
      await vote.save();
      return NextResponse.json({ error: "Vote has ended" }, { status: 400 });
    }
    
    if (vote.type === "Election") {
      const { choice } = body;
      // Allow "Abstain" as a valid choice in addition to the defined options
      if (!vote.options.includes(choice) && choice !== "Abstain") {
        return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
      }
      if (vote.votes.some((v: any) => v.clerkId === clerkId)) {
        return NextResponse.json({ error: "Already voted" }, { status: 400 });
      }
      vote.votes.push({ clerkId, choice });
      await vote.save();
      return NextResponse.json({ success: true });
    } else if (vote.type === "Pledge") {
      // Support batch ballot submission with dual choices
      if (Array.isArray(body.ballot)) {
        for (const item of body.ballot) {
          const { pledge, boardChoice, blackballChoice } = item;
          if (!vote.pledges.includes(pledge)) {
            return NextResponse.json({ error: `Invalid pledge: ${pledge}` }, { status: 400 });
          }
          
          // Check if already voted for this pledge in this round
          if (vote.votes.some((v: any) => v.clerkId === clerkId && v.pledge === pledge && v.round === vote.round)) {
            return NextResponse.json({ error: `Already voted for ${pledge} this round` }, { status: 400 });
          }
          
          // Handle board choice
          if (boardChoice && boardChoice !== "Abstain") {
            const validBoardChoices = ["Continue", "Board"];
            if (!validBoardChoices.includes(boardChoice)) {
              return NextResponse.json({ error: `Invalid board choice for ${pledge}` }, { status: 400 });
            }
            vote.votes.push({ clerkId, pledge, choice: boardChoice, round: "board" });
          } else {
            vote.votes.push({ clerkId, pledge, choice: "Abstain", round: "board" });
          }
          
          // Handle blackball choice
          if (blackballChoice && blackballChoice !== "Abstain") {
            const validBlackballChoices = ["Continue", "Blackball"];
            if (!validBlackballChoices.includes(blackballChoice)) {
              return NextResponse.json({ error: `Invalid blackball choice for ${pledge}` }, { status: 400 });
            }
            vote.votes.push({ clerkId, pledge, choice: blackballChoice, round: "blackball" });
          } else {
            vote.votes.push({ clerkId, pledge, choice: "Abstain", round: "blackball" });
          }
        }
        await vote.save();
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
        if (vote.votes.some((v: any) => v.clerkId === clerkId && v.pledge === pledge && v.round === vote.round)) {
          return NextResponse.json({ error: "Already voted for this pledge this round" }, { status: 400 });
        }
        vote.votes.push({ clerkId, pledge, choice, round: vote.round });
        await vote.save();
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
    const vote = await Vote.findOne({ ended: false }) || await Vote.findOne({ ended: true }).sort({ createdAt: -1 });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No vote found" }, { status: 404 });
    }
    
    // Check if vote should be auto-ended
    if (vote.endTime && new Date() >= vote.endTime && !vote.ended) {
      // Auto-end vote
      vote.ended = true;
      vote.endTime = null;
      await vote.save();
    }
    
    if (vote.type === "Election") {
      const hasVoted = vote.votes.some((v: any) => v.clerkId === clerkId);
      return NextResponse.json({
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
        type: vote.type,
        pledges: vote.pledges,
        started: vote.started,
        ended: vote.ended,
        round: vote.round,
        startedAt: vote.startedAt?.toISOString() || null,
        endTime: vote.endTime?.toISOString() || null,
        votedPledges,
        abstainedPledges,
        totalVotes: Math.floor(vote.votes.filter((v: any) => v.round === "board").length), // Count unique voters
        voterListVerified: vote.voterListVerified || false,
      });
    }
    return NextResponse.json({ error: "Unknown vote type" }, { status: 400 });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote info");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}