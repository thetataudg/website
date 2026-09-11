// api/members/[rollNo]/route.ts

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { maybePresignUrl } from "@/lib/garage";
import { markWalletPassUpdatedForMember } from "@/lib/walletPassStore";
import { detachMemberFromCommittees } from "@/lib/committeeMembership";
import MailAccount from "@/lib/models/MailAccount";

const MEMBER_SECRET_HEADER = process.env.MEMBER_API_SECRET_HEADER || "x-api-secret";
const MEMBER_SECRET_QUERY_PARAM = process.env.MEMBER_API_SECRET_QUERY_PARAM || "secret";
const DEFAULT_DISCORD_BOT_SECRET = process.env.DISCORD_BOT_SECRET || "discord-bot-secret";
const MEMBER_UPDATE_SECRET =
  process.env.MEMBER_UPDATE_API_SECRET ||
  process.env.MEMBER_UPDATE_SECRET ||
  process.env.MEMBER_SECRET ||
  process.env.MEMBERS_API_SECRET ||
  process.env.APPROVAL_API_SECRET ||
  DEFAULT_DISCORD_BOT_SECRET;

function getProvidedSecret(req: Request) {
  try {
    const headerValue = req.headers.get(MEMBER_SECRET_HEADER);
    if (headerValue) {
      return headerValue;
    }
  } catch {
    // ignore
  }
  try {
    const url = new URL(req.url);
    return url.searchParams.get(MEMBER_SECRET_QUERY_PARAM) || undefined;
  } catch {
    return undefined;
  }
}

function normalizeObjectIdList(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value
    .map((entry) => String(entry || "").trim())
    .filter((entry) => entry && /^[a-fA-F0-9]{24}$/.test(entry));
}

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { rollNo: string } }
) {
  await connectDB();
  const member = await Member.findOne({ rollNo: params.rollNo })
    .populate("bigs", "fName lName rollNo")
    .populate("littles", "fName lName rollNo")
    .lean<{ role?: string }>();
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...member,
    profilePicUrl: await maybePresignUrl((member as any).profilePicUrl),
    resumeUrl: await maybePresignUrl((member as any).resumeUrl),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { rollNo: string } }
) {
  const providedSecret = getProvidedSecret(req);
  const secretAuthorized =
    MEMBER_UPDATE_SECRET && providedSecret && providedSecret === MEMBER_UPDATE_SECRET;

  let adminId: string;
  let adminRole: string | null = null;
  if (!secretAuthorized) {
    try {
      const adminObj = await requireRole(req as any, ["superadmin", "admin"]);
      adminId = typeof adminObj === "string" ? adminObj : adminObj.clerkId;
      await connectDB();
      const admin = await Member.findOne({ clerkId: adminId }).lean<{ role?: string }>();
      adminRole = admin?.role || null;
      logger.info({ admin, adminId, adminRole }, "Fetched admin for PATCH");
    } catch (err: any) {
      logger.warn({ err }, "Unauthorized admin PATCH attempt");
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 401 }
      );
    }
  } else {
    adminId = "discord-bot";
    adminRole = "admin";
  }

  const updates = await req.json();
  if (secretAuthorized) {
    const invalidKeys = Object.keys(updates || {}).filter((key) => key !== "discordId");
    if (invalidKeys.length) {
      return NextResponse.json(
        { error: "Secret-based updates may only modify discordId" },
        { status: 400 }
      );
    }
  }
  // Normalized rather than trusted: this route `$set`s the update object
  // wholesale, so an unnormalized value would land in the document as typed.
  if ("phone" in updates) {
    const normalizedPhone = normalizePhone(updates.phone);
    if (!normalizedPhone.ok) {
      return NextResponse.json({ error: normalizedPhone.error }, { status: 400 });
    }
    updates.phone = normalizedPhone.e164;
  }

  if (typeof updates.rollNo === "string") {
    updates.rollNo = updates.rollNo.trim();
    if (!updates.rollNo) {
      delete updates.rollNo;
    }
  }
  if ("bigs" in updates) {
    updates.bigs = normalizeObjectIdList(updates.bigs);
  }
  if ("littles" in updates) {
    updates.littles = normalizeObjectIdList(updates.littles);
  }
  logger.info(
    { adminId, rollNo: params.rollNo, updates },
    "Admin profile update attempt"
  );

  await connectDB();
  const member = await Member.findOne({ rollNo: params.rollNo }).lean<{ role?: string }>();

  if (!member) {
    logger.error(
      { adminId, rollNo: params.rollNo },
      "Admin PATCH failed: member not found"
    );
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (updates.rollNo && updates.rollNo !== params.rollNo) {
    const existing = await Member.findOne({ rollNo: updates.rollNo }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "Roll number already in use" },
        { status: 409 }
      );
    }
  }

  // Admin and legacy superadmin accounts share the same permissions. New role
  // assignments intentionally normalize to "admin" or "member".
  if (
    "role" in updates &&
    (adminRole === "admin" || adminRole === "superadmin")
  ) {
    if (updates.role !== "admin" && updates.role !== "member") {
      logger.warn(
        { adminId, rollNo: params.rollNo, attemptedRole: updates.role },
        "Denied: Invalid role attempted by admin"
      );
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    logger.info(
      { adminId, rollNo: params.rollNo, newRole: updates.role },
      "Admin changed member role"
    );
  } else if ("role" in updates) {
    logger.warn(
      { adminId, rollNo: params.rollNo, attemptedRole: updates.role, adminRole },
      "Denied: Non-admin attempted to change role"
    );
    delete updates.role;
  }

  // Only allow status update for admin/superadmin, and only to valid values
  if ("status" in updates) {
    if (
      adminRole !== "admin" &&
      adminRole !== "superadmin"
    ) {
      logger.warn(
        { adminId, rollNo: params.rollNo, attemptedStatus: updates.status, adminRole },
        "Denied: Non-admin attempted to change status"
      );
      delete updates.status;
    } else if (updates.status !== "Active" && updates.status !== "Alumni" && updates.status !== "Removed" && updates.status !== "Deceased") {
      logger.warn(
        { adminId, rollNo: params.rollNo, attemptedStatus: updates.status },
        "Denied: Invalid status attempted"
      );
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }

  // --- Keep isECouncil and ecouncilPosition in sync ---
  if ("isECouncil" in updates) {
    if (!updates.isECouncil) {
      // If isECouncil is false, clear the position
      updates.ecouncilPosition = "";
    }
  }
  if ("ecouncilPosition" in updates) {
    if (updates.ecouncilPosition && updates.ecouncilPosition.trim() !== "") {
      updates.isECouncil = true;
    }
  }

  const updatedMember = await Member.findOneAndUpdate(
    { rollNo: params.rollNo },
    updates,
    { new: true }
  ).lean<any>();

  if (!updatedMember || Array.isArray(updatedMember)) {
    logger.error(
      { adminId, rollNo: params.rollNo },
      "Admin PATCH failed: member not found after update"
    );
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await markWalletPassUpdatedForMember(updatedMember._id.toString());

  // A status change moves them between actives@ and alumni@ (or off both).
  if ("status" in updates && updates.status) {
    const { syncGroupsAfterStatusChange } = await import("@/lib/googleGroups");
    await syncGroupsAfterStatusChange("member status change");
  }

  // Committees are for actives. Graduating (or removing) someone strips them
  // from every roster and head slot, so they stop showing on the directory,
  // the PDF and the phone with no way to take them off by hand.
  // Chapter mail follows membership: a Removed or Deceased member's mailbox is
  // frozen (no sending, inbound dropped), and thawed if the status comes back.
  if ("status" in updates && updates.status) {
    const frozen = ["Removed", "Deceased"].includes(updates.status);
    await MailAccount.updateOne(
      { memberId: updatedMember._id, status: frozen ? "active" : "suspended" },
      { $set: { status: frozen ? "suspended" : "active" } }
    ).catch((err) =>
      logger.warn({ err, rollNo: params.rollNo }, "Failed to update chapter mailbox status")
    );
  }

  if ("status" in updates && updates.status && updates.status !== "Active") {
    await detachMemberFromCommittees(updatedMember._id).catch((err) =>
      logger.warn(
        { err, rollNo: params.rollNo },
        "Failed to detach non-active member from committees"
      )
    );
  }

  logger.info(
    { adminId, rollNo: params.rollNo, updates },
    "Admin PATCH successful"
  );
  return NextResponse.json(updatedMember, { status: 200 });
}

export async function DELETE(
  req: Request,
  { params }: { params: { rollNo: string } }
) {
  let adminId: string;
  try {
    adminId = await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized admin DELETE attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  await connectDB();
  const member = await Member.findOne({ rollNo: params.rollNo }).lean<{
    clerkId?: string;
  }>();
  if (!member) {
    logger.error(
      { adminId, rollNo: params.rollNo },
      "Admin DELETE failed: member not found"
    );
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await Member.deleteOne({ rollNo: params.rollNo });
  logger.info(
    { adminId, rollNo: params.rollNo },
    "Deleted member from database"
  );

  if (member.clerkId) {
    try {
      await clerkClient.users.deleteUser(member.clerkId);
      logger.info({ adminId, clerkId: member.clerkId }, "Deleted Clerk user");
    } catch (err: any) {
      logger.error(
        { err, clerkId: member.clerkId },
        "Failed to delete Clerk user"
      );
    }
  }

  return NextResponse.json({ status: "deleted" }, { status: 200 });
}
