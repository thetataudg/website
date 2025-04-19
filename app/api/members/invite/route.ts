// app/api/members/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized invitation list attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  } // To test this on postman comment this try catch block and use the below code.

  //   const admin = { clerkId: "local-test", role: "superadmin" }; // This is just for testing the API. Uncomment the above try catch block in PRODUCTION and delete this line.

  try {
    const allInvitations = await clerkClient.invitations.getInvitationList();
    const pending = allInvitations.filter((inv) => inv.status === "pending");
    logger.info("Fetched pending invitations", { count: pending.length });
    return NextResponse.json(pending, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch invitations");
    return NextResponse.json(
      { error: "Could not list invitations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireRole(req, ["superadmin", "admin"]); // To test this on postman comment this line and use the below code.
    // admin = { clerkId: "local-test" };
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized invite attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  const { email } = await req.json();
  if (!email) {
    logger.warn("Invite failed: missing email", { requestedBy: admin.clerkId });
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: process.env.CLERK_ONBOARD_REDIRECT!,
      publicMetadata: { invitedBy: admin.clerkId },
      notify: true,
    });

    logger.info("Invitation sent", {
      email,
      invitedBy: admin.clerkId,
      invitationId: invitation.id,
    });
    return NextResponse.json({ invitationId: invitation.id }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to send invite");
    return NextResponse.json({ error: "Invite failed" }, { status: 500 });
  }
}
