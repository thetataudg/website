// GET /api/members
// Returns all members (TEMP: no auth yet)

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { NextResponse } from "next/server";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();
    const members = await Member.find().lean();

    logger.info(`Fetched ${members.length} members from database`);

    return NextResponse.json(members, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0", // Disable caching
       }
    });

  } catch (error: any) {
    logger.error({ error }, "Failed to fetch members");
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}
