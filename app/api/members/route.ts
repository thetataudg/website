// GET /api/members
// Returns all members (TEMP: no auth yet)

export const dynamic = "force-dynamic"; // Absolutely no caching for this route, disable if it causes billing problems with Netlify

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { maybePresignUrl } from "@/lib/garage";
import { requireRole } from "@/lib/clerk";

export async function GET() {
  try {
    await connectDB();
    const members = await Member.find().lean();

    logger.info(`Fetched ${members.length} members from database`);

    const signedMembers = await Promise.all(
      members.map(async (member: any) => ({
        ...member,
        profilePicUrl: await maybePresignUrl(member.profilePicUrl),
        resumeUrl: await maybePresignUrl(member.resumeUrl),
      }))
    );

    return NextResponse.json(signedMembers, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0", // Disable caching
       }
    });

  } catch (error: any) {
    logger.error({ error }, "Failed to fetch members");
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized member create attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  const payload = await req.json();
  const rollNo = String(payload?.rollNo || "").trim();
  const fName = String(payload?.fName || "").trim();
  const lName = String(payload?.lName || "").trim();
  const gradYear = Number(payload?.gradYear);
  const status = String(payload?.status || "Alumni");
  const majors = Array.isArray(payload?.majors) ? payload.majors : [];
  const minors = Array.isArray(payload?.minors) ? payload.minors : [];
  const committees = Array.isArray(payload?.committees) ? payload.committees : [];
  const bigs = Array.isArray(payload?.bigs) ? payload.bigs : [];
  const littles = Array.isArray(payload?.littles) ? payload.littles : [];
  const skills = Array.isArray(payload?.skills) ? payload.skills : [];
  const funFacts = Array.isArray(payload?.funFacts) ? payload.funFacts : [];
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  const work = Array.isArray(payload?.work) ? payload.work : [];
  const awards = Array.isArray(payload?.awards) ? payload.awards : [];
  const customSections = Array.isArray(payload?.customSections)
    ? payload.customSections
    : [];

  if (!rollNo || !fName || !lName || !Number.isFinite(gradYear)) {
    return NextResponse.json(
      { error: "Missing required fields: rollNo, fName, lName, gradYear" },
      { status: 400 }
    );
  }
  if (!["Active", "Alumni", "Removed", "Deceased"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await connectDB();
  const existing = await Member.findOne({ rollNo }).lean();
  if (existing) {
    return NextResponse.json(
      { error: "A member with this roll number already exists" },
      { status: 409 }
    );
  }

  const member = await Member.create({
    rollNo,
    fName,
    lName,
    gradYear,
    status,
    majors,
    minors,
    committees,
    bigs,
    littles,
    bio: payload?.bio || "",
    headline: payload?.headline || "",
    pronouns: payload?.pronouns || "",
    skills,
    funFacts,
    projects,
    work,
    awards,
    customSections,
    familyLine: payload?.familyLine || "",
    pledgeClass: payload?.pledgeClass || "",
    isECouncil: Boolean(payload?.isECouncil),
    ecouncilPosition: payload?.ecouncilPosition || "",
    isCommitteeHead: Boolean(payload?.isCommitteeHead),
    hometown: payload?.hometown || "",
    socialLinks: payload?.socialLinks || {},
    profilePicUrl: payload?.profilePicUrl || "",
    resumeUrl: payload?.resumeUrl || "",
    role: "member",
    needsProfileReview: false,
    needsPermissionReview: false,
    isHidden: Boolean(payload?.isHidden),
  });

  logger.info({ adminId: admin.clerkId, rollNo }, "Created placeholder profile");
  return NextResponse.json(member, { status: 201 });
}
