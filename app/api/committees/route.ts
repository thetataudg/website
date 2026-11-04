import { syncCommitteeMailboxes } from "@/lib/mail/roleMailboxes";
import { apiErrorResponse } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { requireAuth, requireOfficer } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { isCalendarColor, nextCalendarColor } from "@/lib/calendarColors";
import { listCommittees } from "@/lib/committeeQueries";

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

    // Backfill, self-healing prune and populate: `lib/committeeQueries.ts`,
    // shared with the MCP server.
    const committees = await listCommittees(filter);

    return NextResponse.json(committees, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list committees");
    return apiErrorResponse(err);
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
    // The committee mailbox follows its head.
    await syncCommitteeMailboxes({ force: true });
    return NextResponse.json(committee, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create committee");
    return apiErrorResponse(err);
  }
}
