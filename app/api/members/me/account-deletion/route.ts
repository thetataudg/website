import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import PendingMember from "@/lib/models/PendingMember";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  await connectDB();
  const member = await Member.findOne({ clerkId });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.accountDeletionRequestedAt) {
    return NextResponse.json({ status: "pending" }, { status: 200 });
  }

  const alreadyQueued = await PendingMember.exists({ clerkId });
  if (alreadyQueued) {
    return NextResponse.json(
      { error: "An account request is already pending" },
      { status: 409 }
    );
  }

  const requestedAt = new Date();
  let queuedRequestId: unknown;
  try {
    const queuedRequest = await PendingMember.create({
      requestType: "deletion",
      clerkId,
      rollNo: member.rollNo,
      fName: member.fName,
      lName: member.lName,
      majors: member.majors || [],
      minors: member.minors || [],
      gradYear: member.gradYear || 0,
      pledgeClass: member.pledgeClass || "",
      isECouncil: false,
      preferredStatus: "Removed",
      preferredRole: "member",
      status: "pending",
      submittedAt: requestedAt,
    });
    queuedRequestId = queuedRequest._id;

    member.accountDeletionPreviousHidden = Boolean(member.isHidden);
    member.accountDeletionRequestedAt = requestedAt;
    member.isHidden = true;
    await member.save();

    logger.info({ memberId: member._id.toString(), clerkId }, "Account deletion requested");
    return NextResponse.json(
      { status: "pending", requestedAt: requestedAt.toISOString() },
      { status: 201 }
    );
  } catch (err: any) {
    // Only roll back the row created by this attempt. Never remove a request
    // that may already have existed when a uniqueness race was encountered.
    if (queuedRequestId) {
      await PendingMember.deleteOne({ _id: queuedRequestId });
    }
    logger.error({ err, clerkId }, "Could not create account deletion request");
    return NextResponse.json(
      { error: "Could not submit the deletion request" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  await connectDB();
  const member = await Member.findOne({ clerkId });
  if (!member || !member.accountDeletionRequestedAt) {
    return NextResponse.json({ error: "No deletion request is pending" }, { status: 404 });
  }

  member.isHidden = Boolean(member.accountDeletionPreviousHidden);
  member.accountDeletionRequestedAt = null;
  member.accountDeletionPreviousHidden = undefined;
  await member.save();
  await PendingMember.deleteOne({ clerkId, requestType: "deletion", status: "pending" });

  logger.info({ memberId: member._id.toString(), clerkId }, "Account deletion request canceled");
  return NextResponse.json({ status: "canceled" }, { status: 200 });
}
