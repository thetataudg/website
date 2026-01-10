import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireAuth(req as any);
    await connectDB();

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");

    const filter: any = {};
    if (memberId) {
      filter.$or = [
        { committeeHeadId: memberId },
        { committeeMembers: memberId },
      ];
    }

    const committees = await Committee.find(filter)
      .populate("committeeHeadId", "fName lName rollNo")
      .populate("committeeMembers", "fName lName rollNo")
      .lean();

    return NextResponse.json(committees, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list committees");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
    await connectDB();

    const body = await req.json();
    const { name, description = "", committeeHeadId, committeeMembers = [] } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const committee = await Committee.create({
      name: name.trim(),
      description,
      committeeHeadId,
      committeeMembers,
      events: [],
    });

    if (committeeHeadId) {
      await Member.findByIdAndUpdate(committeeHeadId, {
        isCommitteeHead: true,
      });
    }

    logger.info({ committeeId: committee._id }, "Committee created");
    return NextResponse.json(committee, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create committee");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
