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
    const { type, options, pledges } = await req.json();
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
      options: type === "Election" ? options : [],
      pledges: type === "Pledge" ? pledges : [],
      round: type === "Pledge" ? "board" : undefined,
      started: false,
      ended: false,
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
    const { action } = await req.json();
    const vote = await Vote.findOne({ ended: false });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No active vote to update" }, { status: 404 });
    }
    if (action === "start") {
      if (vote.started) return NextResponse.json({ error: "Vote already started" }, { status: 400 });
      vote.started = true;
      await vote.save();
      return NextResponse.json({ success: true });
    }
    if (action === "end") {
      if (!vote.started) return NextResponse.json({ error: "Vote not started" }, { status: 400 });
      vote.ended = true;
      await vote.save();
      return NextResponse.json({ success: true });
    }
    if (action === "nextRound" && vote.type === "Pledge" && vote.round === "board") {
      vote.round = "blackball";
      vote.started = false; // must be started again for blackball
      await vote.save();
      return NextResponse.json({ success: true });
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
    if (vote.type === "Election") {
      // ...existing code...
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