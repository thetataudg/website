import { NextResponse } from "next/server";
import { requireAuth, requireOfficer } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { isCalendarColor, nextCalendarColor } from "@/lib/calendarColors";

/**
 * Gives a colour to any committee created before committees had colours.
 *
 * Runs on read because that is the only route every client hits, and it is a
 * no-op the moment there is nothing left to fix. Without it the app would have
 * to invent a colour locally, and the website and the phone would disagree
 * about which committee is teal.
 */
async function backfillColors() {
  const uncoloured = await Committee.find({
    $or: [{ color: { $exists: false } }, { color: null }],
  })
    .select("_id")
    .lean<any[]>();
  if (!uncoloured.length) return;

  const taken = (
    await Committee.find({ color: { $nin: [null] } })
      .select("color")
      .lean<any[]>()
  ).map((committee) => committee.color);

  for (const committee of uncoloured) {
    const color = nextCalendarColor(taken);
    taken.push(color);
    await Committee.updateOne({ _id: committee._id }, { $set: { color } });
  }
  logger.info({ count: uncoloured.length }, "Backfilled committee calendar colours");
}

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

    await backfillColors();

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
    await requireOfficer(req as any);
    await connectDB();

    const body = await req.json();
    const { name, description = "", committeeHeadId, committeeMembers = [], color } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Every committee gets a colour the moment it exists, so its events are
    // distinguishable on the calendar without anybody being asked to choose
    // one. Least-used wins, so a new committee never doubles up on a colour
    // while an unused one is sitting there.
    const taken = (await Committee.find({}).select("color").lean<any[]>()).map(
      (existing) => existing.color
    );
    const assigned = isCalendarColor(color) ? color : nextCalendarColor(taken);

    const committee = await Committee.create({
      name: name.trim(),
      description,
      committeeHeadId,
      committeeMembers,
      events: [],
      color: assigned,
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
