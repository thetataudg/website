// app/api/members/invitations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";
import { connectDB } from "@/lib/db";
import { emailToSlug } from "@/utils/email-to-slug";
import Member from "@/lib/models/Member";

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

  try {
    // 1. Fetch all pending invitations from Clerk
    const allInvitations = await clerkClient.invitations.getInvitationList();
    const pendingInvitations = allInvitations.filter((inv) => inv.status === "pending");

    // 2. Fetch all Members' Clerk IDs
    const members = await Member.find({}, { clerkId: 1 }).lean();
    const memberClerkIds = new Set(members.map((m: any) => m.clerkId));

    // 3. For each invitation, get the Clerk user for the email
    //    and filter out if their Clerk ID is in the Member DB
    const filteredInvitations = [];
    for (const inv of pendingInvitations) {
      try {
        const users = await clerkClient.users.getUserList({ emailAddress: [inv.emailAddress] });
        if (users.length > 0) {
          const clerkId = users[0].id;
          if (memberClerkIds.has(clerkId)) {
            // Already accepted: mark as accepted
            filteredInvitations.push({ ...inv, status: "accepted" });
          } else {
            // Not yet accepted: keep as pending
            filteredInvitations.push({ ...inv, status: "pending" });
          }
        } else {
          // No Clerk user yet: keep as pending
          filteredInvitations.push({ ...inv, status: "pending" });
        }
      } catch (e) {
        // On error, keep as pending
        filteredInvitations.push({ ...inv, status: "pending" });
      }
    }

    logger.info("Fetched filtered pending invitations", { count: filteredInvitations.length });
    return NextResponse.json(filteredInvitations, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch invitations");
    return NextResponse.json(
      { error: "Could not list invitations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // 1. Check for secret in body or query
  let secret: string | undefined;
  let body: any = {};
  try {
    body = await req.json();
    secret = body.secret;
  } catch {
    // fallback: try to get from query string
    secret = req.nextUrl.searchParams.get("secret") || undefined;
  }

  // 2. If secret is valid, allow; else require admin
  const ENV_SECRET = process.env.INVITE_SECRET;
  let admin;

  console.log("Secret:", secret, "ENV Secret:", ENV_SECRET);

  if (secret && ENV_SECRET && secret === ENV_SECRET) {
    // Bypass admin check
    admin = { clerkId: "secret-invite" };
  } else {
    try {
      admin = await requireRole(req as any, ["superadmin", "admin"]);
    } catch (err: any) {
      logger.warn({ err }, "Unauthorized invite attempt");
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
  }

  const { email } = body;

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