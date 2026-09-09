// app/api/availability/[id]/suggestions/route.ts
// GET - manager only. Runs the solver and returns the ranked times, each with
//       who would be there and who would be missing.
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { solve } from "@/lib/availability/solve";
import { currentMember, loadPollContext } from "@/lib/availability/routeHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await currentMember(req);
    const ctx = await loadPollContext(params.id, member);
    if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!ctx.isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const poll = ctx.poll;
    const isWeekday = poll.dateMode === "weekdays";
    const dates: string[] = poll.dates || [];
    const weekdays: number[] = poll.weekdays || [];
    if (!isWeekday && !dates.length) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }
    if (isWeekday && !weekdays.length) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }
    const windowStart = isWeekday
      ? new Date()
      : DateTime.fromISO(dates[0], { zone: ARIZONA_ZONE })
          .startOf("day")
          .toJSDate();

    // Chapter-wide events, plus this committee's own. A recurring parent can
    // start before the window, so those are pulled in regardless of endTime
    // and expanded by the solver.
    const events = await Event.find({
      status: { $in: ["scheduled", "ongoing"] },
      $or: [{ committeeId: null }, { committeeId: poll.committeeId ?? null }],
    })
      .select("startTime endTime status committeeId recurrence")
      .lean<any[]>();
    const relevant = events.filter(
      (e) => e.recurrence?.enabled || new Date(e.endTime) >= windowStart
    );

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 6, 1), 20);

    const ranked = solve(
      {
        dateMode: poll.dateMode || "dates",
        dates,
        weekdays,
        dayStartMinute: poll.dayStartMinute,
        dayEndMinute: poll.dayEndMinute,
        slotMinutes: poll.slotMinutes,
        meetingMinutes: poll.meetingMinutes,
        invitees: (poll.invitees || []).map((i: any) => ({
          memberId: String(i.memberId),
        })),
        responses: (poll.responses || []).map((r: any) => ({
          memberId: String(r.memberId),
          slots: r.slots || [],
        })),
        committeeId: poll.committeeId ? String(poll.committeeId) : null,
      },
      relevant.map((e) => ({
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        committeeId: e.committeeId ? String(e.committeeId) : null,
        recurrence: e.recurrence,
      })),
      { limit }
    );

    const nameRows = await Member.find({
      _id: { $in: (poll.invitees || []).map((i: any) => i.memberId) },
    })
      .select("_id fName lName")
      .lean<any[]>();
    const nameById = new Map(
      nameRows.map((m) => [
        String(m._id),
        `${m.fName ?? ""} ${m.lName ?? ""}`.trim(),
      ])
    );
    const withNames = (ids: string[]) =>
      ids.map((id) => ({ memberId: id, name: nameById.get(id) || "Unknown" }));

    return NextResponse.json(
      {
        inviteeCount: (poll.invitees || []).length,
        suggestions: ranked.map((r) => ({
          ...r,
          available: withNames(r.availableMemberIds),
          missing: withNames(r.missingMemberIds),
        })),
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to compute availability suggestions");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
