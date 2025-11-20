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
  if (!member || Array.isArray(member) || !member.isECouncil) {
    throw new Error("Not authorized - E-Council only");
  }
  return member;
}

// POST: Add an option to an election vote
export async function POST(req: Request) {
  try {
    await requireECouncil(req);
    const { voteId, option } = await req.json();
    
    if (!voteId || !option) {
      return NextResponse.json({ error: "voteId and option are required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findById(voteId);
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (vote.type !== "Election") {
      return NextResponse.json({ error: "Can only manage options for Election votes" }, { status: 400 });
    }
    
    if (vote.started) {
      return NextResponse.json({ error: "Cannot modify options after vote has started" }, { status: 400 });
    }
    
    // Check if option already exists
    if (vote.options.includes(option)) {
      return NextResponse.json({ error: "Option already exists" }, { status: 400 });
    }
    
    vote.options.push(option);
    await vote.save();
    
    return NextResponse.json({ success: true, options: vote.options });
  } catch (err: any) {
    logger.error({ err }, "Failed to add option");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// DELETE: Remove an option from an election vote
export async function DELETE(req: Request) {
  try {
    await requireECouncil(req);
    const { searchParams } = new URL(req.url);
    const voteId = searchParams.get('voteId');
    const option = searchParams.get('option');
    
    if (!voteId || !option) {
      return NextResponse.json({ error: "voteId and option are required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findById(voteId);
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (vote.type !== "Election") {
      return NextResponse.json({ error: "Can only manage options for Election votes" }, { status: 400 });
    }
    
    if (vote.started) {
      return NextResponse.json({ error: "Cannot modify options after vote has started" }, { status: 400 });
    }
    
    // Check if any proxy votes exist for this option
    const hasProxyVotes = vote.votes.some((v: any) => v.choice === option && v.proxy === true);
    
    if (hasProxyVotes) {
      // Mark as removed instead of deleting
      if (!vote.removedOptions) {
        vote.removedOptions = [];
      }
      if (!vote.removedOptions.includes(option)) {
        vote.removedOptions.push(option);
      }
    }
    
    // Remove from options array
    vote.options = vote.options.filter((opt: string) => opt !== option);
    
    if (vote.options.length === 0) {
      return NextResponse.json({ error: "Cannot remove all options" }, { status: 400 });
    }
    
    await vote.save();
    
    return NextResponse.json({ success: true, options: vote.options, removedOptions: vote.removedOptions || [] });
  } catch (err: any) {
    logger.error({ err }, "Failed to remove option");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
