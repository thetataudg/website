// app/api/members/invitations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { clerkClient } from "@clerk/clerk-sdk-node";
import logger from "@/lib/logger";
import { connectDB } from "@/lib/db";
import { emailToSlug } from "@/utils/email-to-slug";
import Member from "@/lib/models/Member";
import EmailDelivery from "@/lib/models/EmailDelivery";
import { getRequestSource } from "@/lib/request-source";
import {
  invitationEmailConfigured,
  sendInvitationEmail,
} from "@/lib/notify/inviteEmail";

export async function GET(req: Request) {
  await connectDB();
  const requestSource = getRequestSource(req);

  logger.info(
    {
      event: "Members invitations request",
      route: "/api/members/invitations",
      source: requestSource,
    },
    "Request received"
  );

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
    // 1. Fetch pending invitations from Clerk.
    //
    // Asking Clerk for status "pending" rather than pulling every invitation
    // and filtering here: the unfiltered endpoint returns accepted ones too and
    // is capped by a default page size, so once the chapter accumulated enough
    // accepted invitations they would have crowded the genuinely pending ones
    // out of the response and off this screen.
    const pendingInvitations = await clerkClient.invitations.getInvitationList({
      status: "pending",
    });

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

    // Attach what we know about the invitation email itself. Clerk's REST API
    // has no delivery field, so this comes from the `email.created` webhook
    // recorded in app/api/clerk/webhook. An address with no row either predates
    // the webhook being configured, or Clerk never created an email for it.
    const addresses = filteredInvitations.map((inv) =>
      inv.emailAddress.toLowerCase()
    );
    const deliveries = await EmailDelivery.find({
      toEmailAddress: { $in: addresses },
      slug: "invitation",
    })
      .sort({ occurredAt: -1 })
      .lean();

    const latestByAddress = new Map<string, any>();
    for (const d of deliveries as any[]) {
      // Sorted newest-first, so the first one seen for an address wins.
      if (!latestByAddress.has(d.toEmailAddress)) {
        latestByAddress.set(d.toEmailAddress, d);
      }
    }

    const withDelivery = filteredInvitations.map((inv) => {
      const d = latestByAddress.get(inv.emailAddress.toLowerCase());
      return {
        ...inv,
        emailDelivery: d
          ? {
              status: d.status ?? null,
              occurredAt: d.occurredAt ?? null,
              deliveredByClerk: d.deliveredByClerk ?? null,
            }
          : null,
      };
    });

    logger.info({
      event: "Fetched filtered pending invitations",
      count: withDelivery.length,
      withEmailRecord: latestByAddress.size,
    });
    return NextResponse.json(withDelivery, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch invitations");
    return NextResponse.json(
      { error: "Could not list invitations" },
      { status: 500 }
    );
  }
}

/// Creates a Clerk invitation through the REST API rather than the SDK.
///
/// Two reasons the SDK will not do. Its `Invitation` class is constructed from
/// six fields and `url` is not one of them, so `createInvitation().url` is
/// undefined at runtime, not merely untyped — and that ticket URL is the whole
/// point when we mail the invitation ourselves. It also lets the caller read
/// Clerk's error codes directly, which matter here: `duplicate_record` when any
/// prior invitation exists (a revoked one counts, even though the message says
/// "already pending") and `form_identifier_exists` when the address already has
/// a Clerk user.
async function createInvitation(params: {
  email: string;
  redirectUrl: string;
  notify: boolean;
}): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch("https://api.clerk.com/v1/invitations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: params.email,
      redirect_url: params.redirectUrl,
      notify: params.notify,
      // Without this, every address that has ever been invited and rejected is
      // permanently un-invitable: rejecting deletes the Clerk user, which
      // revokes their invitation, and a revoked invitation still trips Clerk's
      // duplicate check. There is no API to delete one.
      ignore_existing: true,
    }),
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
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
  const requestSource = getRequestSource(req);

  logger.info(
    {
      event: "Members invitations invite request",
      route: "/api/members/invitations",
      source: requestSource,
      secretProvided: Boolean(secret),
      secretMatch: Boolean(secret && ENV_SECRET && secret === ENV_SECRET),
    },
    "Request received"
  );

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

  // Who mails the invitation. Clerk's own copy cannot be restyled without the
  // paid `app:custom_email_template` feature, so when Resend is available we
  // create the invitation silently and send the branded version ourselves. If
  // it is not, Clerk sends its plain one: an unbranded invitation beats an
  // invitation nobody receives.
  const weSendIt = invitationEmailConfigured();

  try {
    const created = await createInvitation({ email, redirectUrl, notify: !weSendIt });

    if (!created.ok) {
      const friendly =
        created.body?.errors?.[0]?.long_message ||
        created.body?.errors?.[0]?.message ||
        "Invite failed";
      logger.error({ status: created.status, body: created.body }, "Failed to send invite");
      return NextResponse.json({ error: friendly }, { status: created.status });
    }

    const invitation = created.body;

    if (weSendIt) {
      const result = await sendInvitationEmail({
        email,
        // Clerk's ticket URL, the same link its own email would have carried.
        acceptUrl: invitation.url,
      });

      if (!result.sent) {
        // Roll the invitation back. Leaving it pending would mean an address
        // that received nothing yet cannot be re-invited without hitting
        // Clerk's duplicate check, and would sit in the admin's pending list
        // looking as though it had been delivered.
        try {
          await clerkClient.invitations.revokeInvitation(invitation.id);
        } catch (revokeErr: any) {
          logger.error(
            { err: revokeErr, invitationId: invitation.id },
            "Could not revoke an invitation whose email failed"
          );
        }
        logger.error(
          { reason: result.reason, email },
          "Invitation created but the email could not be sent"
        );
        return NextResponse.json(
          { error: "Could not send the invitation email. Nothing was sent; try again." },
          { status: 502 }
        );
      }
    }

    logger.info({
      event: "Invitation sent",
      invitationId: invitation.id,
      by: admin.clerkId,
      sentVia: weSendIt ? "resend" : "clerk",
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
