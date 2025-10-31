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

// GET: Get pledge con status
export async function GET(req: Request) {
  try {
    await requireECouncil(req);
    await connectDB();
    
    const vote = await Vote.findOne({}).sort({ createdAt: -1 });
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No vote found" }, { status: 404 });
    }
    
    if (vote.type !== "Pledge") {
      return NextResponse.json({ error: "Not a pledge vote" }, { status: 400 });
    }
    
    // Convert Map to object for JSON response
    const pledgeValidCons: Record<string, boolean> = {};
    if (vote.pledgeValidCons) {
      vote.pledges.forEach((pledge: string) => {
        pledgeValidCons[pledge] = vote.pledgeValidCons.get(pledge) || false;
      });
    } else {
      // Initialize all to false if not set
      vote.pledges.forEach((pledge: string) => {
        pledgeValidCons[pledge] = false;
      });
    }
    
    return NextResponse.json({ 
      pledges: vote.pledges,
      pledgeValidCons 
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get pledge cons");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

// POST: Update pledge con status
export async function POST(req: Request) {
  try {
    await requireECouncil(req);
    const { pledgeValidCons } = await req.json();
    
    if (!pledgeValidCons || typeof pledgeValidCons !== 'object') {
      return NextResponse.json({ error: "pledgeValidCons object is required" }, { status: 400 });
    }
    
    await connectDB();
    const vote = await Vote.findOne({}).sort({ createdAt: -1 });
    
    if (!vote || Array.isArray(vote)) {
      return NextResponse.json({ error: "No vote found" }, { status: 404 });
    }
    
    if (vote.type !== "Pledge") {
      return NextResponse.json({ error: "Not a pledge vote" }, { status: 400 });
    }
    
    // Update the pledgeValidCons map
    if (!vote.pledgeValidCons) {
      vote.pledgeValidCons = new Map();
    }
    
    // Update each pledge's con status
    Object.entries(pledgeValidCons).forEach(([pledge, hasCon]) => {
      if (vote.pledges.includes(pledge)) {
        vote.pledgeValidCons.set(pledge, Boolean(hasCon));
      }
    });
    
    await vote.save();
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to update pledge cons");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
