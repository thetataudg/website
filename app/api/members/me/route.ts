// app/api/members/me/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export const runtime = "nodejs";

interface MeGetResult {
  rollNo: string;
  profilePicUrl?: string;
  resumeUrl?: string;
  role: string;
}
interface MemberUpdateResult {
  profilePicUrl?: string;
  resumeUrl?: string;
}

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized /api/members/me GET");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  logger.info({ clerkId }, "Fetching member/me details");

  await connectDB();
  const member = await Member.findOne({ clerkId })
    .select(
      "rollNo profilePicUrl resumeUrl role status isECouncil ecouncilPosition needsProfileReview needsPermissionReview"
    )
    .lean() as any;

  if (!member || Array.isArray(member)) {
    logger.error({ clerkId }, "Member not found for /api/members/me GET");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  logger.info({ clerkId, rollNo: member.rollNo }, "Member/me GET successful");
  return NextResponse.json(
    {
      rollNo: member.rollNo,
      profilePicUrl: member.profilePicUrl,
      resumeUrl: member.resumeUrl,
      role: member.role,
      status: member.status,
      isECouncil: member.isECouncil,
      ecouncilPosition: member.ecouncilPosition,
      needsProfileReview: member.needsProfileReview,
      needsPermissionReview: member.needsPermissionReview,
    },
    { status: 200 }
  );
}

export async function PATCH(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized /api/members/me PATCH");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  const updates = await req.json();
  logger.info({ clerkId, updates }, "Self-profile update requested");

  await connectDB();
  const member = await Member.findOneAndUpdate({ clerkId }, updates, {
    new: true,
  }).lean();

  if (!member) {
    logger.error({ clerkId }, "Self‐profile update failed: not found");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  logger.info({ clerkId }, "Self‐profile update successful");
  return NextResponse.json(member, { status: 200 });
}
