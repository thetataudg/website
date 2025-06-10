// app/api/members/invitations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";
import { connectDB } from "@/lib/db";
import { emailToSlug } from "@/utils/email-to-slug";

export async function GET(req: Request) {
  await connectDB();

  try {
    await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized invitation list attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode || 401 }
    );
  }

  // 2) fetch from Clerk
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
  // ── 1) Only admins may invite ──────────────────────────
  let admin;
  try {
    admin = await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized invite attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const redirectUrl =
    `${process.env.NEXT_PUBLIC_APP_URL}` +
    `/member/onboard/${emailToSlug(email)}`;

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      notify: true,
    });

    logger.info("Invitation sent", {
      invitationId: invitation.id,
      by: admin.clerkId,
    });
    return NextResponse.json(invitation, { status: 201 });
  } catch (err: any) {
    const friendly = err?.errors?.[0]?.longMessage || "Invite failed";
    logger.error({ err }, "Failed to send invite");
    return NextResponse.json(
      { error: friendly },
      { status: err.status || 500 }
    );
  }
}
