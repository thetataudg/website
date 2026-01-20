import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/clerk";
import Member from "@/lib/models/Member";
import { generateCheckInCode } from "@/lib/checkinCode";

async function getMemberByClerk(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean<{
    _id: string;
    role?: string;
  }>();
  if (!member || Array.isArray(member) || !member._id) {
    throw new Error("Not authorized");
  }
  return member;
}

export async function GET(req: Request) {
  try {
    const member = await getMemberByClerk(req);
    const codePayload = generateCheckInCode(member._id.toString());
    return NextResponse.json({
      code: codePayload.code,
      expiresAt: codePayload.expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to refresh check-in code" },
      { status: 403 }
    );
  }
}
