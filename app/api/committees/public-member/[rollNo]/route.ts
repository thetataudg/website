import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export async function GET(
  _req: Request,
  { params }: { params: { rollNo: string } }
) {
  try {
    await connectDB();

    const member = await Member.findOne({ rollNo: params.rollNo })
      .select("_id")
      .lean();

    if (!member?._id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const committees = await Committee.find(
      {
        $or: [
          { committeeHeadId: member._id },
          { committeeMembers: member._id },
        ],
      },
      { name: 1, committeeHeadId: 1 }
    ).lean();

    const headCommittees = committees
      .filter((committee) =>
        committee.committeeHeadId?.toString() === member._id.toString()
      )
      .map((committee) => committee.name);

    const memberCommittees = committees.map((committee) => committee.name);

    return NextResponse.json(
      { headCommittees, memberCommittees },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err, rollNo: params.rollNo }, "Failed to fetch public committees");
    return NextResponse.json(
      { error: "Failed to fetch committees" },
      { status: 500 }
    );
  }
}
