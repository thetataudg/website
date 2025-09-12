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
    const { type, options } = await req.json();
    if (type !== "Election" || !Array.isArray(options) || options.length < 1) {
      return NextResponse.json({ error: "Invalid vote type or options" }, { status: 400 });
    }
    // Only one open vote at a time
    const existing = await Vote.findOne({ ended: false });
    if (existing) {
      return NextResponse.json({ error: "A vote is already in progress" }, { status: 400 });
    }
    const vote = await Vote.create({
      type,
      options,
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
    // Only allow deleting a vote that has ended
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

// PATCH: Start or end a vote
export async function PATCH(req: Request) {
  try {
    await requireECouncil(req);
    const { action } = await req.json();
    const vote = await Vote.findOne({ ended: false });
    if (!vote || Array.isArray(vote)) {
    return NextResponse.json({ error: "No active vote to delete" }, { status: 404 });
    }
    if (!vote) {
      return NextResponse.json({ error: "No vote to update" }, { status: 404 });
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
    const vote = await Vote.findOne({ ended: true });
    if (!vote || Array.isArray(vote)) {
    return NextResponse.json({ error: "No active vote to delete" }, { status: 404 });
    }
    if (!vote) return NextResponse.json({ error: "No vote found" }, { status: 404 });
    // Tally results
    const tally: Record<string, number> = {};
    for (const opt of vote.options) tally[opt] = 0;
    for (const v of vote.votes) {
      if (typeof v.choice === "string" && tally.hasOwnProperty(v.choice)) {
        tally[v.choice]++;
      }
    }
    return NextResponse.json({
      type: vote.type,
      options: vote.options,
      started: vote.started,
      ended: vote.ended,
      results: tally,
      totalVotes: vote.votes.length,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote results");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}