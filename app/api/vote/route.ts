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
    const { choice } = await req.json();
    const vote = await Vote.findOne({ ended: false });
    if (!vote || Array.isArray(vote)) {
    return NextResponse.json({ error: "No active vote to delete" }, { status: 404 });
    }
    if (!vote) return NextResponse.json({ error: "No active vote" }, { status: 404 });
    if (!vote.options.includes(choice)) {
      return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
    }
    // Only one vote per member
    if (vote.votes.some((v: any) => v.clerkId === clerkId)) {
      return NextResponse.json({ error: "Already voted" }, { status: 400 });
    }
    vote.votes.push({ clerkId, choice });
    await vote.save();
    return NextResponse.json({ success: true });
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
    const hasVoted = vote.votes.some((v: any) => v.clerkId === clerkId);
    return NextResponse.json({
      type: vote.type,
      options: vote.options,
      started: vote.started,
      ended: vote.ended,
      hasVoted,
      totalVotes: vote.votes.length,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get vote info");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}