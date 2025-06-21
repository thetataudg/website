import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server"; // or "@clerk/nextjs/api" for API routes
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const { userId, sessionId, getToken } = getAuth(req as any);
    if (!userId) {
      throw { message: "Not authenticated", statusCode: 401 };
    }

    // Fetch user from the DB or Clerk and check role
    const user = await Member.findOne({ clerkId: userId });
    if (!user || !["superadmin", "admin"].includes(user.role)) {
      throw { message: "Not authorized", statusCode: 403 };
    }
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized pending list attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode || 401 }
    );
  }

  await connectDB();
  const list = await PendingMember.find({ status: "pending" }).lean();
  return NextResponse.json(list);
}
