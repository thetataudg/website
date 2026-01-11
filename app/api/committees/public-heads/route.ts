import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();

    const committees = await Committee.find({}, { name: 1, committeeHeadId: 1 })
      .populate("committeeHeadId", "rollNo fName lName")
      .lean();

    const heads = committees
      .filter((committee: any) => committee.committeeHeadId)
      .map((committee: any) => ({
        committeeName: committee.name,
        head: committee.committeeHeadId
          ? {
              rollNo: committee.committeeHeadId.rollNo,
              fName: committee.committeeHeadId.fName,
              lName: committee.committeeHeadId.lName,
            }
          : null,
      }))
      .filter((entry: any) => entry.head && entry.head.rollNo);

    return NextResponse.json(heads, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch public committee heads");
    return NextResponse.json({ error: "Failed to fetch committee heads" }, { status: 500 });
  }
}
