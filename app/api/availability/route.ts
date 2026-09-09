// app/api/availability/route.ts
// GET  - the polls waiting on me, and the polls I manage.
// POST - open a new poll (same permission rule as creating the event it will
//        become: see lib/eventAuth.ts).
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";
import { checkEventScopeAccess } from "@/lib/eventAuth";
import { createAvailabilityPoll } from "@/lib/availability/service";
import { currentMember } from "@/lib/availability/routeHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const member = await currentMember(req);
    const me = member._id?.toString();
    const isOfficer =
      member.role === "admin" ||
      member.role === "superadmin" ||
      member.isECouncil;

    const shape = (poll: any) => {
      const responded = (poll.responses || []).filter(
        (r: any) => r.source !== "prefill"
      );
      return {
        ...poll,
        respondedCount: responded.length,
        inviteeCount: (poll.invitees || []).length,
        hasResponded: responded.some((r: any) => r.memberId?.toString() === me),
      };
    };

    // The committee dashboard asks for one committee's polls. Any member of
    // that committee (invitee or head) may see them.
    const { searchParams } = new URL(req.url);
    const committeeId = searchParams.get("committeeId");
    if (committeeId) {
      const committee = await Committee.findById(committeeId)
        .select("committeeHeadId committeeMembers")
        .lean<any>();
      const onCommittee =
        isOfficer ||
        committee?.committeeHeadId?.toString() === me ||
        (committee?.committeeMembers || []).some(
          (id: any) => id.toString() === me
        );
      if (!onCommittee) {
        return NextResponse.json({ polls: [] }, { status: 200 });
      }
      const polls = await AvailabilityPoll.find({
        committeeId,
        status: { $in: ["open", "closed", "scheduled"] },
      })
        .sort({ status: 1, createdAt: -1 })
        .lean<any[]>();
      return NextResponse.json({ polls: polls.map(shape) }, { status: 200 });
    }

    const [waitingOnMe, iManage] = await Promise.all([
      AvailabilityPoll.find({
        status: "open",
        "invitees.memberId": member._id,
      })
        .sort({ deadline: 1 })
        .lean<any[]>(),
      AvailabilityPoll.find({
        $or: [{ createdBy: member._id }, ...(await managedCommitteeFilter(member))],
      })
        .sort({ createdAt: -1 })
        .lean<any[]>(),
    ]);

    return NextResponse.json(
      {
        // "Needs your availability" — drop the ones already answered by hand.
        waitingOnMe: waitingOnMe.map(shape).filter((p) => !p.hasResponded),
        iManage: iManage.map(shape),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to list availability polls");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

/// Committees this member heads, as a Mongo `$or` fragment for the "I manage"
/// query. Admins and E-Council see every poll.
async function managedCommitteeFilter(member: any) {
  const isAdmin = member.role === "admin" || member.role === "superadmin";
  if (isAdmin || member.isECouncil) {
    return [{ _id: { $exists: true } }];
  }
  const headed = await Committee.find({ committeeHeadId: member._id })
    .select("_id")
    .lean<any[]>();
  if (!headed.length) return [];
  return [{ committeeId: { $in: headed.map((c) => c._id) } }];
}

export async function POST(req: Request) {
  try {
    const member = await currentMember(req);
    const body = await req.json();

    const access = await checkEventScopeAccess(member as any, body.committeeId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    await connectDB();
    const poll = await createAvailabilityPoll(
      {
        title: body.title,
        description: body.description,
        committeeId: body.committeeId || null,
        dateMode: body.dateMode,
        dates: body.dates,
        weekdays: body.weekdays,
        dayStartMinute: body.dayStartMinute,
        dayEndMinute: body.dayEndMinute,
        slotMinutes: body.slotMinutes,
        meetingMinutes: body.meetingMinutes,
        deadline: body.deadline,
        reminder: body.reminder,
        inviteeIds: body.inviteeIds,
        inviteesExact: body.inviteesExact,
      },
      member._id
    );

    return NextResponse.json(poll, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create availability poll");
    // The service throws plain Errors for bad input; everything else is a 403
    // to match the events route's shape.
    const status = /required|date|window|meeting|deadline|nobody|month|day of the week/i.test(
      err.message || ""
    )
      ? 400
      : 403;
    return NextResponse.json({ error: err.message }, { status });
  }
}
