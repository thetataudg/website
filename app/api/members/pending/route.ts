import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  await connectDB();

  // --- Secret bypass logic ---
  let secret: string | undefined;
  try {
    // Try to get secret from query string
    const url = new URL(req.url);
    secret = url.searchParams.get("secret") || undefined;
  } catch {
    secret = undefined;
  }
  const ENV_SECRET = process.env.INVITE_SECRET;

  let allow = false;

  console.log("Secret:", secret, "ENV Secret:", ENV_SECRET);

  if (secret && ENV_SECRET && secret === ENV_SECRET) {
    allow = true;
  }

  try {
    if (!allow) {
      const { userId } = getAuth(req as any);
      if (!userId) {
        throw { message: "Unauthorized", statusCode: 401 };
      }

      // Fetch user from the DB or Clerk and check role
      const user = await Member.findOne({ clerkId: userId });
      if (!user || !["superadmin", "admin"].includes(user.role)) {
        throw { message: "Unauthorized", statusCode: 403 };
      }
    }
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized pending list attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode || 401 }
    );
  }

  const list = await PendingMember.find({ status: "pending" }).lean();
  return NextResponse.json(list);
}