// app/api/members/me/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import PendingMember from "@/lib/models/PendingMember";
import logger from "@/lib/logger";
import { maybePresignUrl } from "@/lib/garage";

export const runtime = "nodejs";

interface MeGetResult {
  memberId: string;
  rollNo: string;
  profilePicUrl?: string;
  resumeUrl?: string;
  role: string;
}
interface MemberUpdateResult {
  profilePicUrl?: string;
  resumeUrl?: string;
}

type PendingMemberDoc = {
  _id?: { toString: () => string };
  rollNo?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
  status?: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewComments?: string;
  discordId?: string;
};

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
      "rollNo profilePicUrl resumeUrl role status isECouncil ecouncilPosition needsProfileReview needsPermissionReview isCommitteeHead headline pronouns majors minors gradYear bio hometown skills funFacts projects work awards customSections socialLinks discordId"
    )
    .lean() as any;

    if (member && !Array.isArray(member)) {
        logger.info({ clerkId, rollNo: member.rollNo }, "Member/me GET successful");
        return NextResponse.json(
            {
                memberId: member._id?.toString(),
                rollNo: member.rollNo,
                profilePicUrl: await maybePresignUrl(member.profilePicUrl),
                resumeUrl: await maybePresignUrl(member.resumeUrl),
                role: member.role,
                status: member.status,
                isECouncil: member.isECouncil,
                ecouncilPosition: member.ecouncilPosition,
                isCommitteeHead: member.isCommitteeHead,
                needsProfileReview: member.needsProfileReview,
                needsPermissionReview: member.needsPermissionReview,
                discordId: member.discordId || null,
            },
            { status: 200 }
        );
    }

  const pending = (await PendingMember.findOne({ clerkId }).lean()) as
    | PendingMemberDoc
    | null;
    if (pending) {
        logger.info(
            { clerkId, rollNo: pending.rollNo },
            "Member/me GET served pending profile"
        );
        return NextResponse.json(
            {
                memberId: null,
                pending: true,
        pendingId: pending._id?.toString(),
        rollNo: pending.rollNo,
        role: "member",
        status: "Pending",
        isECouncil: pending.isECouncil,
        ecouncilPosition: pending.ecouncilPosition,
        isCommitteeHead: false,
        needsProfileReview: pending.status === "pending",
        needsPermissionReview: pending.isECouncil,
        pendingStatus: pending.status,
        pendingSubmittedAt: pending.submittedAt?.toISOString(),
                pendingReviewComments: pending.reviewComments,
                pendingReviewedAt: pending.reviewedAt?.toISOString(),
                discordId: pending.discordId || null,
            },
            { status: 200 }
        );
    }

  logger.error({ clerkId }, "Member not found for /api/members/me GET");
  return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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

  const sanitized: any = {};
  const assignIf = (key: string, value: any) => {
    if (value !== undefined) sanitized[key] = value;
  };

  const ensureArray = (value: any) => (Array.isArray(value) ? value : undefined);
  const parseRollNos = (value: any) => {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  };
  const resolveRollRefs = async (rollNos: string[], limit: number) => {
    const normalized = rollNos.slice(0, limit);
    if (!normalized.length) return [];
    const docs = await Member.find({ rollNo: { $in: normalized } }, { rollNo: 1 }).lean();
    const map = new Map(docs.map((doc: any) => [doc.rollNo, doc._id]));
    return normalized
      .map((roll) => map.get(roll))
      .filter(Boolean);
  };

  assignIf("headline", updates.headline);
  assignIf("pronouns", updates.pronouns);
  assignIf("majors", ensureArray(updates.majors));
  assignIf("minors", ensureArray(updates.minors));
  assignIf("gradYear", updates.gradYear);
  assignIf("pledgeClass", updates.pledgeClass);
  assignIf("bio", updates.bio);
  assignIf("hometown", updates.hometown);
  assignIf("skills", ensureArray(updates.skills));
  assignIf("funFacts", ensureArray(updates.funFacts));
  assignIf("projects", ensureArray(updates.projects));
  assignIf("work", ensureArray(updates.work));
  assignIf("awards", ensureArray(updates.awards));
  assignIf("customSections", ensureArray(updates.customSections));
  assignIf("socialLinks", updates.socialLinks);

  await connectDB();
  if ("bigs" in updates) {
    sanitized.bigs = await resolveRollRefs(parseRollNos(updates.bigs), 1);
  }
  if ("littles" in updates) {
    sanitized.littles = await resolveRollRefs(parseRollNos(updates.littles), 5);
  }
  const member = await Member.findOneAndUpdate(
    { clerkId },
    { $set: sanitized },
    { new: true, runValidators: true, strict: false }
  ).lean();

  if (!member) {
    logger.error({ clerkId }, "Self‐profile update failed: not found");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  logger.info({ clerkId }, "Self‐profile update successful");
  return NextResponse.json(member, { status: 200 });
}
