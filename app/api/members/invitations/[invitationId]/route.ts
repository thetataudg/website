// app/api/members/invitations/[invitationId]/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";

export async function DELETE(
  req: Request,
  { params }: { params: { invitationId: string } }
) {
  let admin: { clerkId: string; role: string };
  try {
    admin = await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized invitation revoke attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  } // To test this on postman comment this try catch block and use the below code.

  // TEMPORARY FOR LOCAL TESTING:
  // const admin = { clerkId: "local-test", role: "superadmin" };

  try {
    const allInvites = await clerkClient.invitations.getInvitationList();
    const invite = allInvites.find((i) => i.id === params.invitationId);

    if (!invite) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }
    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot revoke an invitation in status '${invite.status}'` },
        { status: 400 }
      );
    }

    await clerkClient.invitations.revokeInvitation(params.invitationId);
    logger.info("Invitation revoked", {
      invitationId: params.invitationId,
      revokedBy: admin.clerkId,
    });
    return NextResponse.json({ status: "revoked" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to revoke invitation");
    return NextResponse.json(
      { error: err.message || "Could not revoke invitation" },
      { status: 500 }
    );
  }
}
