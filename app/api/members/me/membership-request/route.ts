import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import logger from "@/lib/logger";

export const runtime = "nodejs";

// Cancels an access request and the authentication account created for it.
// This is intentionally explicit and user-initiated; an officer rejecting a
// request leaves it in place so the applicant can first see the decision.
export async function DELETE(req: NextRequest) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  await connectDB();
  const pending = await PendingMember.findOne({ clerkId, requestType: { $ne: "deletion" } });
  if (!pending) {
    return NextResponse.json({ error: "No membership request was found" }, { status: 404 });
  }

  try {
    await clerkClient.users.deleteUser(clerkId);
  } catch (err: any) {
    logger.error({ err, clerkId }, "Could not delete Clerk account while canceling membership request");
    return NextResponse.json(
      { error: "Could not delete the sign-in account" },
      { status: 502 }
    );
  }

  await PendingMember.deleteOne({ _id: pending._id });
  logger.info({ pendingId: pending._id.toString(), clerkId }, "Membership request canceled");
  return NextResponse.json({ status: "deleted" }, { status: 200 });
}
