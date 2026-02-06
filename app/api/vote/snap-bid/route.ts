import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Vote from "@/lib/models/Vote";
import logger from "@/lib/logger";

// Helper to check Regent
async function requireRegent(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  // Check if member is Regent
  if (!member.ecouncilPosition || !member.ecouncilPosition.toLowerCase().includes("regent")) {
    throw new Error("Only Regent can snap bid");
  }
  return member;
}

// POST: Toggle snap bid for a rushee
export async function POST(req: Request) {
  try {
    await requireRegent(req);
    const { voteId, rushee } = await req.json();
    
    if (!voteId || !rushee) {
      return NextResponse.json({ error: "voteId and rushee are required" }, { status: 400 });
    }
    
    const vote = await Vote.findById(voteId);
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    
    if (vote.type !== "Bidding") {
      return NextResponse.json({ error: "Only Bidding votes support snap bids" }, { status: 400 });
    }
    
    if (!vote.rushees.includes(rushee)) {
      return NextResponse.json({ error: "Invalid rushee" }, { status: 400 });
    }
    
    // Toggle snap bid
    if (!vote.snapBids) {
      vote.snapBids = [];
    }
    
    const index = vote.snapBids.indexOf(rushee);
    if (index > -1) {
      // Remove snap bid
      vote.snapBids.splice(index, 1);
    } else {
      // Add snap bid
      vote.snapBids.push(rushee);
    }
    
    await vote.save();
    
    return NextResponse.json({ success: true, snapBids: vote.snapBids });
  } catch (err: any) {
    logger.error({ err }, "Failed to toggle snap bid");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
