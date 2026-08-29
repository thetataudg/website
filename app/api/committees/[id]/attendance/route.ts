// GET /api/committees/<id>/attendance
//
// Who has been turning up to one committee's meetings.
//
// The transpose of `/api/events/attendance?memberId=`, which answers "what has
// this member been to". A chair's question is the other way round: across the
// meetings we have held, who came to how many. Aggregated here rather than in
// the client because the alternative is asking for the attendee list of every
// event the committee has ever held, one request each, and handing the whole
// chapter's check-in history to anybody who can open the page.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idOf = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.toString === "function") return value.toString();
  return "";
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();

    const viewer = await Member.findOne({ clerkId })
      .select("_id role isECouncil")
      .lean<any>();
    if (!viewer) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Committee not found" }, { status: 404 });
    }

    const committee = await Committee.findById(params.id)
      .select("name committeeHeadId committeeMembers")
      .lean<any>();
    if (!committee) {
      return NextResponse.json({ error: "Committee not found" }, { status: 404 });
    }

    // Who came to what is information about other people, so it is not open to
    // the whole roster. Officers, and the chair of this committee.
    const isOfficer =
      viewer.role === "admin" ||
      viewer.role === "superadmin" ||
      Boolean(viewer.isECouncil);
    const isHead = idOf(committee.committeeHeadId) === idOf(viewer._id);
    if (!isOfficer && !isHead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only meetings that have already happened. A meeting scheduled for next
    // week has nobody at it, and counting it would drag every attendance rate
    // down for no reason.
    const now = new Date();
    const events = await Event.find({
      committeeId: committee._id,
      startTime: { $lte: now },
      status: { $ne: "cancelled" },
    })
      .select("name startTime attendees")
      .sort({ startTime: -1 })
      .lean<any[]>();

    // The people the rate is measured against: whoever is on the committee
    // now, plus the head. Somebody who has since left still appears if they
    // attended, marked as no longer on it, because deleting them from the
    // history would make past meetings look emptier than they were.
    const rosterIds = new Set<string>(
      [
        ...(Array.isArray(committee.committeeMembers) ? committee.committeeMembers : []),
        committee.committeeHeadId,
      ]
        .map(idOf)
        .filter(Boolean)
    );

    const attendedBy = new Map<string, number>();
    const lastSeen = new Map<string, Date>();
    for (const event of events) {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      // One person counts once per meeting however many times they scanned.
      const seen = new Set<string>();
      for (const entry of attendees) {
        const memberId = idOf(entry?.memberId ?? entry);
        if (!memberId || seen.has(memberId)) continue;
        seen.add(memberId);
        attendedBy.set(memberId, (attendedBy.get(memberId) ?? 0) + 1);
        const at = entry?.checkedInAt ? new Date(entry.checkedInAt) : event.startTime;
        const previous = lastSeen.get(memberId);
        if (at && (!previous || at > previous)) lastSeen.set(memberId, at);
      }
    }

    const everyone = Array.from(new Set([...rosterIds, ...attendedBy.keys()]));
    const people = everyone.length
      ? await Member.find({ _id: { $in: everyone } })
          .select("_id rollNo fName lName profilePicUrl")
          .lean<any[]>()
      : [];

    const held = events.length;
    const rows = people
      .map((person) => {
        const id = idOf(person._id);
        const attended = attendedBy.get(id) ?? 0;
        return {
          memberId: id,
          rollNo: person.rollNo ?? "",
          firstName: person.fName ?? "",
          lastName: person.lName ?? "",
          attended,
          held,
          lastAttendedAt: lastSeen.get(id)?.toISOString() ?? null,
          // False for somebody who attended but has since come off the
          // committee. The rate still reads correctly; the row says why.
          onCommittee: rosterIds.has(id),
        };
      })
      .sort((a, b) => {
        if (b.attended !== a.attended) return b.attended - a.attended;
        return `${a.lastName}${a.firstName}`.localeCompare(
          `${b.lastName}${b.firstName}`
        );
      });

    return NextResponse.json(
      {
        committeeId: idOf(committee._id),
        committeeName: committee.name ?? "",
        meetingsHeld: held,
        meetings: events.map((event) => ({
          id: idOf(event._id),
          name: event.name ?? "Untitled",
          startTime: event.startTime ?? null,
          attended: Array.isArray(event.attendees) ? event.attendees.length : 0,
        })),
        members: rows,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err?.statusCode === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error({ err, committeeId: params.id }, "Failed to read committee attendance");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
