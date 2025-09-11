import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";

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
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await connectDB();
  const pending = await PendingMember.findById(params.id);
  if (!pending) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "approve") {
    await Member.create({
      clerkId: pending.clerkId,
      rollNo: pending.rollNo,
      fName: pending.fName,
      lName: pending.lName,
      majors: pending.majors,
      gradYear: pending.gradYear,
      bio: pending.bio,
      committees: pending.committees,
      familyLine: pending.familyLine,
      pledgeClass: pending.pledgeClass,
      isECouncil: pending.isECouncil,
      ecouncilPosition: pending.ecouncilPosition,
      hometown: pending.hometown,
      resumeUrl: pending.resumeUrl,
      profilePicUrl: pending.profilePicUrl,
      socialLinks: pending.socialLinks,
      status: "Active",
      role: "member",
      needsProfileReview: false,
      needsPermissionReview: false,
    });

    await PendingMember.findByIdAndDelete(params.id);
    logger.info("Pending request approved and deleted", {
      pendingId: params.id,
      approvedBy: admin.clerkId,
    });

    return NextResponse.json({ status: "approved" }, { status: 200 });
  } else {
    try {
      await clerkClient.users.deleteUser(pending.clerkId);
      logger.info("Clerk user deleted", { clerkId: pending.clerkId });
    } catch (err: any) {
      logger.error({ err }, "Failed to delete Clerk user");
    }

    await PendingMember.findByIdAndDelete(params.id);
    logger.info("Pending request rejected and deleted", {
      pendingId: params.id,
      rejectedBy: admin.clerkId,
      comments: reviewComments,
    });

    return NextResponse.json({ status: "rejected" }, { status: 200 });
  }
}