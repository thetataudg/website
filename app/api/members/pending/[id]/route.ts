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
  try {
    admin = await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized review attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  } // To test this on postman comment this try catch block and use the below code.
  //   admin = { clerkId: "local-test", role: "superadmin" }; // This is just for testing the API. Uncomment the above try catch block in PRODUCTION and delete this line.

  const { action, reviewComments } = await req.json();
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
