import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import GemRecord from "@/lib/models/GemRecord";
import logger from "@/lib/logger";
import { gemDuesStandingsFor } from "@/lib/gemDues";
import {
  GEM_POINTS_AVAILABLE,
  GEM_POINTS_REQUIRED,
  GemAttendanceCounts,
  GemCommitteeDetail,
  GemOverride,
  committeeMajorityFor,
  computeGemChapterTotals,
  emptyGemAttendanceCounts,
  evaluateGem,
  formatSemesterDate,
  normalizeGemCategory,
  normalizeGemCriterionKey,
  normalizeGemStanding,
  parseSemesterRange,
} from "@/lib/gem";

async function getViewer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = (await Member.findOne({ clerkId }).lean()) as any;
  if (!member) {
    throw new Error("Not authorized");
  }
  return member;
}

function isAdmin(member: any) {
  return member?.role === "admin" || member?.role === "superadmin";
}

/// Who may read the whole chapter's board rather than only their own row.
/// Any seat on E-Council, matching what the drawer offers in the app.
function canReadChapter(member: any) {
  return isAdmin(member) || Boolean(member?.isECouncil);
}

/// Who may change a GEM record — record a Section 2 substitution, move
/// somebody onto probation, write down a GPA.
///
/// Narrower than reading on purpose, and matched to the same four seats the
/// vote routes admit: the Regent and Vice Regent run the Section 3 process,
/// the Scribe keeps the attendance record Article V puts in their hands, and
/// admins cover for all three. Every other seat on E-Council can look.
function canWriteGem(member: any) {
  if (isAdmin(member)) return true;
  const position = (member?.ecouncilPosition || "").toLowerCase();
  return position.includes("regent") || position.includes("scribe");
}

function extractMemberId(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return mongoose.Types.ObjectId.isValid(value) ? value : null;
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }
  if (Array.isArray(value) && value.length) {
    return extractMemberId(value[0]);
  }
  if (value && typeof value === "object") {
    const candidate = value._id ?? value;
    if (candidate && candidate !== value) {
      return extractMemberId(candidate);
    }
    if (typeof value.toString === "function") {
      const asString = value.toString();
      if (mongoose.Types.ObjectId.isValid(asString)) {
        return asString;
      }
    }
  }
  return null;
}

/// An event with no explicit GEM category still counts if its type says what
/// it was. Chapter meetings are general conferences; a meeting owned by a
/// committee is that committee's meeting.
function resolveEventGemCategory(event: any): string | null {
  const normalized = normalizeGemCategory(event?.gemCategory);
  if (normalized) {
    return normalized;
  }
  if (event?.eventType === "chapter") {
    return "general-conference";
  }
  if (event?.eventType === "meeting" && event?.committeeId) {
    return "committee-meeting";
  }
  return null;
}

interface MemberStats {
  counts: GemAttendanceCounts;
  committeeAttendance: Map<string, number>;
  /// Tabling slots the member signed up for, and how many they turned up to.
  tablingAssigned: number;
  tablingAttended: number;
}

function emptyStats(): MemberStats {
  return {
    counts: emptyGemAttendanceCounts(),
    committeeAttendance: new Map<string, number>(),
    tablingAssigned: 0,
    tablingAttended: 0,
  };
}

/// Which counter a category feeds. Committee meetings are handled separately
/// because they are counted per committee, not chapter-wide.
const COUNTER_FOR_CATEGORY: Record<string, keyof GemAttendanceCounts> = {
  "general-conference": "general",
  "pillar-brotherhood": "brotherhood",
  "pillar-service": "service",
  "pillar-professionalism": "professionalism",
  "rush-event": "rushEvent",
  "rush-tabling": "rushTabling",
  "fso-event": "fso",
  "lock-in": "lockIn",
  regionals: "regionals",
  "pnm-meeting": "pnmMeeting",
  "pnm-event": "pnmEvent",
};

interface MemberLean {
  _id: mongoose.Types.ObjectId;
  rollNo?: string;
  fName?: string;
  lName?: string;
  status?: string;
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
}

export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req);
    const viewerId = viewer._id?.toString();
    const privileged = canReadChapter(viewer);

    const { searchParams } = new URL(req.url);
    const memberIdParam = searchParams.get("memberId");
    if (memberIdParam && !mongoose.Types.ObjectId.isValid(memberIdParam)) {
      return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
    }
    if (!privileged && memberIdParam && memberIdParam !== viewerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const semesterRange = parseSemesterRange({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      semester: searchParams.get("semester"),
    });

    const now = new Date();
    const events = await Event.find({
      startTime: { $gte: semesterRange.startDate, $lte: semesterRange.endDate },
      status: { $ne: "cancelled" },
    })
      .select("committeeId attendees rsvps startTime eventType status gemCategory")
      .lean();

    const members = await Member.find({ status: "Active" })
      .select("rollNo fName lName status role isECouncil ecouncilPosition")
      .lean<MemberLean[]>();
    if (
      viewerId &&
      !members.some((member) => member._id?.toString() === viewerId)
    ) {
      const viewerDoc = await Member.findById(viewerId).lean();
      if (viewerDoc) {
        members.push(viewerDoc as (typeof members)[number]);
      }
    }
    const committees = await Committee.find().lean();

    const committeeMembership = new Map<string, { id: string; name: string }[]>();
    const attachMemberToCommittee = (
      memberVal: any,
      committeeId: string,
      committeeName: string
    ) => {
      const memberId = extractMemberId(memberVal);
      if (!memberId) return;
      const list = committeeMembership.get(memberId) || [];
      if (!list.some((entry) => entry.id === committeeId)) {
        list.push({ id: committeeId, name: committeeName });
        committeeMembership.set(memberId, list);
      }
    };

    committees.forEach((committee) => {
      const id = committee._id?.toString();
      if (!id) return;
      attachMemberToCommittee(committee.committeeHeadId, id, committee.name);
      (committee.committeeMembers || []).forEach((memberIdVal: any) =>
        attachMemberToCommittee(memberIdVal, id, committee.name)
      );
    });

    const memberStats = new Map<string, MemberStats>();
    members.forEach((member) => {
      const memberId = member._id?.toString();
      if (!memberId) return;
      memberStats.set(memberId, emptyStats());
    });

    const committeeTotals = new Map<string, number>();
    let generalTotal = 0;
    let pnmMeetingTotal = 0;

    events.forEach((event) => {
      const startTime = event.startTime ? new Date(event.startTime) : null;
      if (!startTime) return;
      // An event still in the future hasn't happened, so it neither raises the
      // bar nor counts against anybody — unless it has already been closed out.
      if (startTime > now && event.status !== "completed") return;
      const category = resolveEventGemCategory(event);
      if (!category) return;
      if (category === "general-conference") {
        generalTotal += 1;
      }
      if (category === "pnm-meeting") {
        pnmMeetingTotal += 1;
      }
      const committeeId = event.committeeId ? event.committeeId.toString() : null;
      if (category === "committee-meeting" && committeeId) {
        const current = committeeTotals.get(committeeId) || 0;
        committeeTotals.set(committeeId, current + 1);
      }

      const attendeeIds = new Set<string>();
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      attendees.forEach((attendee: any) => {
        const id = extractMemberId(attendee?.memberId);
        if (id) {
          attendeeIds.add(id);
        }
      });

      // A tabling slot is "assigned" when the member said they were taking it.
      // The chapter signs up for slots through RSVP, so a "going" RSVP is the
      // assignment, and the attendance list is whether they turned up.
      if (category === "rush-tabling") {
        const rsvps = Array.isArray(event.rsvps) ? event.rsvps : [];
        rsvps.forEach((rsvp: any) => {
          if (rsvp?.status !== "going") return;
          const id = extractMemberId(rsvp?.memberId);
          if (!id) return;
          const stats = memberStats.get(id);
          if (!stats) return;
          stats.tablingAssigned += 1;
          if (attendeeIds.has(id)) {
            stats.tablingAttended += 1;
          }
        });
      }

      attendeeIds.forEach((memberId) => {
        const stats = memberStats.get(memberId);
        if (!stats) return;
        const counter = COUNTER_FOR_CATEGORY[category];
        if (counter) {
          stats.counts[counter] += 1;
        }
        if (category === "committee-meeting" && committeeId) {
          const current = stats.committeeAttendance.get(committeeId) || 0;
          stats.committeeAttendance.set(committeeId, current + 1);
        }
      });
    });

    const filteredMembers = privileged
      ? memberIdParam
        ? members.filter((member) => member._id?.toString() === memberIdParam)
        : members
      : members.filter((member) => member._id?.toString() === viewerId);
    if (!privileged && filteredMembers.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const memberIds = filteredMembers.map((member) => member._id.toString());
    const [gemRecords, duesStandings] = await Promise.all([
      GemRecord.find({
        memberId: { $in: memberIds },
        semester: semesterRange.name,
      }).lean(),
      gemDuesStandingsFor(memberIds, semesterRange.name, now),
    ]);
    const gemRecordByMember = new Map(
      gemRecords.map((record: any) => [record.memberId?.toString(), record])
    );

    const totals = computeGemChapterTotals({ generalTotal, pnmMeetingTotal });

    const membersOutput = filteredMembers
      .map((member) => {
        const memberId = member._id.toString();
        const stats = memberStats.get(memberId) || emptyStats();
        const memberships = committeeMembership.get(memberId) || [];
        const committeeDetails: GemCommitteeDetail[] = memberships.map((committee) => {
          const totalMeetings = committeeTotals.get(committee.id) || 0;
          const attended = stats.committeeAttendance.get(committee.id) || 0;
          const required =
            totalMeetings <= 2 ? totalMeetings : committeeMajorityFor(totalMeetings);
          const satisfied = totalMeetings <= 2 ? true : attended >= required;
          return {
            id: committee.id,
            name: committee.name,
            totalMeetings,
            attended,
            required,
            satisfied,
          };
        });

        const record = gemRecordByMember.get(memberId);
        const overrides: GemOverride[] = (record?.overrides || [])
          .map((entry: any) => {
            const key = normalizeGemCriterionKey(entry?.key);
            if (!key) return null;
            return {
              key,
              granted: entry?.granted !== false,
              note: entry?.note || "",
            };
          })
          .filter(Boolean) as GemOverride[];

        const evaluation = evaluateGem({
          counts: stats.counts,
          committees: committeeDetails,
          tabling: {
            assigned: stats.tablingAssigned,
            attended: stats.tablingAttended,
          },
          dues:
            duesStandings.get(memberId) ||
            { state: "none", detail: "No dues charged this semester" },
          totals,
          overrides,
        });

        return {
          memberId,
          role: member.role || "member",
          rollNo: member.rollNo,
          fName: member.fName,
          lName: member.lName,
          status: member.status,
          isECouncil: Boolean(member.isECouncil),
          ecouncilPosition: member.ecouncilPosition || null,
          committees: memberships.map((c) => c.name),
          committeeIds: memberships.map((c) => c.id),
          committeeDetails,
          requirements: evaluation.requirements,
          points: evaluation.points,
          requirementsMet: evaluation.requirementsMet,
          pointsEarned: evaluation.pointsEarned,
          pointsRequired: evaluation.pointsRequired,
          pointsAvailable: evaluation.pointsAvailable,
          hasCompletedGem: evaluation.hasCompletedGem,
          standing: normalizeGemStanding(record?.standing) || "none",
          standingNote: record?.standingNote || "",
          gpa: {
            value: typeof record?.gpa === "number" ? record.gpa : null,
            recordId: record?._id?.toString?.() || null,
          },
          gemRecordUpdatedAt: record?.updatedAt || null,
        };
      })
      .sort((a, b) => (a.rollNo || "").localeCompare(b.rollNo || ""));

    return NextResponse.json(
      {
        semesterName: semesterRange.name,
        startDate: formatSemesterDate(semesterRange.startDate),
        endDate: formatSemesterDate(semesterRange.endDate),
        pointsRequired: GEM_POINTS_REQUIRED,
        pointsAvailable: GEM_POINTS_AVAILABLE,
        totals,
        canManage: canWriteGem(viewer),
        members: membersOutput,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch GEM status");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// Record what a room decided.
///
/// Three separate things live behind one route because they all write the same
/// document: the semester GPA the chapter still keeps, the Article V Section 2
/// substitutions, and where the member sits in the Section 3 process. Each is
/// optional, and only the keys actually present are touched — sending a
/// standing must not silently blank an override.
export async function PATCH(req: Request) {
  try {
    const viewer = await getViewer(req);
    if (!canWriteGem(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const memberId = body?.memberId;
    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    await connectDB();
    const member = await Member.findById(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const semesterRange = parseSemesterRange({ semester: body?.semester });
    const updates: Record<string, any> = {};

    if (body?.gpa !== undefined) {
      if (body.gpa === null || body.gpa === "") {
        updates.gpa = null;
      } else {
        const gpa = Number(body.gpa);
        if (Number.isNaN(gpa)) {
          return NextResponse.json({ error: "Invalid GPA" }, { status: 400 });
        }
        if (gpa < 0 || gpa > 4) {
          return NextResponse.json(
            { error: "GPA must be between 0.0 and 4.0" },
            { status: 400 }
          );
        }
        updates.gpa = gpa;
      }
    }

    if (body?.standing !== undefined) {
      const standing = normalizeGemStanding(body.standing);
      if (!standing) {
        return NextResponse.json({ error: "Invalid standing" }, { status: 400 });
      }
      updates.standing = standing;
    }

    if (body?.standingNote !== undefined) {
      updates.standingNote = String(body.standingNote || "").slice(0, 2000);
    }

    // One override at a time, keyed by criterion. `granted: null` clears it and
    // hands the row back to the attendance record.
    if (body?.override !== undefined) {
      const key = normalizeGemCriterionKey(body.override?.key);
      if (!key) {
        return NextResponse.json(
          { error: "Invalid GEM criterion" },
          { status: 400 }
        );
      }
      const existing = await GemRecord.findOne({
        memberId: member._id,
        semester: semesterRange.name,
      }).lean<any>();
      const kept = (existing?.overrides || []).filter(
        (entry: any) => entry?.key !== key
      );
      if (body.override?.granted === null) {
        updates.overrides = kept;
      } else {
        updates.overrides = [
          ...kept,
          {
            key,
            granted: body.override?.granted !== false,
            note: String(body.override?.note || "").slice(0, 2000),
            setBy: viewer._id,
            setAt: new Date(),
          },
        ];
      }
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const record = await GemRecord.findOneAndUpdate(
      { memberId: member._id, semester: semesterRange.name },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ record }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update GEM record");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
