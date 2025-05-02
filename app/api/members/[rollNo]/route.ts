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
  const member = await Member.findOne({ rollNo: params.rollNo }).lean();
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
  try {
    adminId = await requireRole(req as any, ["superadmin", "admin"]);
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
    "Admin profile update"
  );

  await connectDB();
  const member = await Member.findOneAndUpdate(
    { rollNo: params.rollNo },
    updates,
    { new: true }
  ).lean();

  if (!member) {
    logger.error(
      { adminId, rollNo: params.rollNo },
      "Admin PATCH failed: member not found"
    );
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  logger.info({ adminId, rollNo: params.rollNo }, "Admin PATCH successful");
  return NextResponse.json(member, { status: 200 });
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
