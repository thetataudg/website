import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  // try {
  //   await requireRole(req as any, ["superadmin", "admin"]);
  // } catch (err: any) {
  //   logger.warn({ err }, "Unauthorized pending list attempt");
  //   return NextResponse.json(
  //     { error: err.message },
  //     { status: err.statusCode }
  //   );
  // } // To test this on postman comment this try catch block and use the below code.

  const admin = { clerkId: "local-test", role: "superadmin" }; // This is just for testing the API. Uncomment the above try catch block in PRODUCTION and delete this line.

  await connectDB();
  const list = await PendingMember.find({ status: "pending" }).lean();
  return NextResponse.json(list);
}
