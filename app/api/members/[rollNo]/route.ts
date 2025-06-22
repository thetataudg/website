// api/members/[rollNo]/route.ts

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { clerkClient } from "@clerk/clerk-sdk-node";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { rollNo: string } }
) {
  await connectDB();
  const member = await Member.findOne({ rollNo: params.rollNo }).lean<{ role?: string }>();
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  return NextResponse.json(member);
}

export async function PATCH(
  req: Request,
  { params }: { params: { rollNo: string } }
) {
  let adminId: string;
  let adminRole: string | null = null;
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
      { status: err.statusCode }
    );
  }

  const updates = await req.json();
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

  // Only superadmin can change role, and not for superadmin users
  if (
    "role" in updates &&
    adminRole === "superadmin" &&
    member.role !== "superadmin"
  ) {
    // Only allow "admin" or "member"
    if (updates.role !== "admin" && updates.role !== "member") {
      logger.warn(
        { adminId, rollNo: params.rollNo, attemptedRole: updates.role },
        "Denied: Invalid role attempted by superadmin"
      );
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    logger.info(
      { adminId, rollNo: params.rollNo, newRole: updates.role },
      "Superadmin changed member role"
    );
    // Allow role update
  } else if ("role" in updates) {
    logger.warn(
      { adminId, rollNo: params.rollNo, attemptedRole: updates.role, adminRole },
      "Denied: Non-superadmin attempted to change role or tried to change superadmin"
    );
    // Remove role update if not allowed
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
    } else if (updates.status !== "Active" && updates.status !== "Alumni") {
      logger.warn(
        { adminId, rollNo: params.rollNo, attemptedStatus: updates.status },
        "Denied: Invalid status attempted"
      );
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }

  const updatedMember = await Member.findOneAndUpdate(
    { rollNo: params.rollNo },
    updates,
    { new: true }
  ).lean();

  if (!updatedMember) {
    logger.error(
      { adminId, rollNo: params.rollNo },
      "Admin PATCH failed: member not found after update"
    );
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
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
    clerkId: string;
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

  try {
    await clerkClient.users.deleteUser(member.clerkId);
    logger.info({ adminId, clerkId: member.clerkId }, "Deleted Clerk user");
  } catch (err: any) {
    logger.error(
      { err, clerkId: member.clerkId },
      "Failed to delete Clerk user"
    );
  }

  return NextResponse.json({ status: "deleted" }, { status: 200 });
}