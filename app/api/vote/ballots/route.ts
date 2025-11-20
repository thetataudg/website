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

// GET: Get list of all active members with their voting status
export async function GET(req: Request) {
  try {
    await requireECouncil(req);
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
    
    // Build voter status for each member
    const voterList = activeMembers.map(member => {
      const memberVotes = vote.votes.filter((v: any) => v.clerkId === member.clerkId);
      const isInvalidated = vote.invalidatedBallots?.includes(member.clerkId);

      // Determine if any of the member's ballots are marked as proxy
      const hasProxy = memberVotes.some((v: any) => v.proxy === true);

      // status can be 'voted', 'proxy', or 'no-ballot'
      let status: 'voted' | 'no-ballot' | 'proxy' = 'no-ballot';

      if (memberVotes.length > 0 && !isInvalidated) {
        // If any of the submitted ballots were proxy, mark as proxy
        status = hasProxy ? 'proxy' : 'voted';
      } else if (isInvalidated) {
        status = 'no-ballot';
      }

      return {
        clerkId: member.clerkId,
        name: `${member.fName} ${member.lName}`,
        rollNo: member.rollNo,
        status,
        isInvalidated,
        isProxy: hasProxy,
      };
    });
    
    return NextResponse.json({ 
      voterList,
      voteType: vote.type,
      voteEnded: vote.ended,
      voterListVerified: vote.voterListVerified || false
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get voter list");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// POST: Invalidate a ballot
export async function POST(req: Request) {
  try {
    await requireECouncil(req);
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
    await requireECouncil(req);
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
    await requireECouncil(req);
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
