import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";

const memberStatusOptions = ["Active", "Alumni", "Removed", "Deceased"];
const memberRoleOptions = ["superadmin", "admin", "member"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let admin;
  let secret: string | undefined;
  let body: any = {};

  // Try to parse secret from JSON body
  try {
    body = await req.json();
    secret = body.secret;
  } catch {
    body = {};
    secret = undefined;
  }

  const ENV_SECRET = process.env.INVITE_SECRET;

  if (secret && ENV_SECRET && secret === ENV_SECRET) {
    // Bypass admin check
    admin = { clerkId: "secret-approval", role: "superadmin" };
  } else {
    try {
      admin = await requireRole(req, ["superadmin", "admin"]);
    } catch (err: any) {
      logger.warn({ err }, "Unauthorized review attempt");
      console.log("PATCH body:", body, "secret:", secret, "ENV_SECRET:", ENV_SECRET);
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
  }

  const { action, reviewComments } = body;
  if (!["approve", "reject", "update"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await connectDB();
  const pending = await PendingMember.findById(params.id);
  if (!pending) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "update") {
    const updates = body?.updates || {};
    const sanitized: any = {};
    const assignIf = (key: string, value: any) => {
      if (value !== undefined) sanitized[key] = value;
    };
    const ensureArray = (value: any) => (Array.isArray(value) ? value : undefined);

    assignIf("rollNo", updates.rollNo?.trim());
    assignIf("fName", updates.fName);
    assignIf("lName", updates.lName);
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
    if (updates.preferredStatus && memberStatusOptions.includes(updates.preferredStatus)) {
      sanitized.preferredStatus = updates.preferredStatus;
    }
    if (updates.preferredRole && memberRoleOptions.includes(updates.preferredRole)) {
      sanitized.preferredRole = updates.preferredRole;
    }

    if (sanitized.rollNo && sanitized.rollNo !== pending.rollNo) {
      const existingMember = await Member.findOne({ rollNo: sanitized.rollNo }).lean();
      if (existingMember) {
        return NextResponse.json(
          { error: "Roll number already in use" },
          { status: 409 }
        );
      }
      const existingPending = await PendingMember.findOne({
        rollNo: sanitized.rollNo,
        _id: { $ne: pending._id },
      }).lean();
      if (existingPending) {
        return NextResponse.json(
          { error: "Roll number already in use" },
          { status: 409 }
        );
      }
    }

    const updatedPending = await PendingMember.findByIdAndUpdate(
      params.id,
      { $set: sanitized },
      { new: true }
    ).lean();

    return NextResponse.json(updatedPending, { status: 200 });
  }

  if (action === "approve") {
    await Member.create({
      clerkId: pending.clerkId,
      rollNo: pending.rollNo,
      fName: pending.fName,
      lName: pending.lName,
      headline: pending.headline,
      pronouns: pending.pronouns,
      majors: pending.majors,
      minors: pending.minors,
      gradYear: pending.gradYear,
      bio: pending.bio,
      pledgeClass: pending.pledgeClass,
      skills: pending.skills,
      funFacts: pending.funFacts,
      projects: pending.projects,
      work: pending.work,
      awards: pending.awards,
      customSections: pending.customSections,
      committees: pending.committees,
      familyLine: pending.familyLine,
      isECouncil: pending.isECouncil,
      ecouncilPosition: pending.ecouncilPosition,
      hometown: pending.hometown,
      resumeUrl: pending.resumeUrl,
      profilePicUrl: pending.profilePicUrl,
      socialLinks: pending.socialLinks,
      status: pending.preferredStatus || "Active",
      role: pending.preferredRole || "member",
      needsProfileReview: false,
      needsPermissionReview: false,
    });

    await PendingMember.findByIdAndDelete(params.id);
    logger.info({
      event: "Pending request approved and deleted",
      pendingId: params.id,
      approvedBy: admin.clerkId,
    });

    return NextResponse.json({ status: "approved" }, { status: 200 });
  } else {
    try {
      await clerkClient.users.deleteUser(pending.clerkId);
      logger.info({
        event: "Clerk user deleted",
        clerkId: pending.clerkId,
      });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete Clerk user");
    }

    await PendingMember.findByIdAndDelete(params.id);
    logger.info({
      event: "Pending request rejected and deleted",
      pendingId: params.id,
      rejectedBy: admin.clerkId,
      comments: reviewComments,
    });

    await Member.deleteOne({ clerkId: pending.clerkId });

    return NextResponse.json({ status: "rejected" }, { status: 200 });
  }
}
