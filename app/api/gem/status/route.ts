import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import GemRecord from "@/lib/models/GemRecord";
import logger from "@/lib/logger";
import { GEM_GPA_THRESHOLD, parseSemesterRange, normalizeGemCategory } from "@/lib/gem";

const RUSH_TARGET = 5;

async function getViewer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = (await Member.findOne({ clerkId }).lean()) as any;
  if (!member) {
    throw new Error("Not authorized");
  }
  return member;
}

function isPrivileged(member: any) {
  return (
    member.role === "admin" ||
    member.role === "superadmin" ||
    Boolean(member.isECouncil)
  );
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

function getDefaultMemberStats() {
  return {
    general: 0,
    brotherhood: 0,
    service: 0,
    professionalism: 0,
    rushEvent: 0,
    rushTabling: 0,
    fso: 0,
    lockIn: 0,
    committeeAttendance: new Map<string, number>(),
  };
}

export async function GET(req: Request) {
  try {
    const viewer = await getViewer(req);
    const viewerId = viewer._id?.toString();
    const privileged = isPrivileged(viewer);

    const { searchParams } = new URL(req.url);
    const memberIdParam = searchParams.get("memberId");
    if (memberIdParam && !mongoose.Types.ObjectId.isValid(memberIdParam)) {
      return NextResponse.json({ error: "Invalid memberId" }, { status: 400 });
    }
    if (!privileged && memberIdParam && memberIdParam !== viewerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hasFilters =
      Boolean(searchParams.get("start")) ||
      Boolean(searchParams.get("end")) ||
      Boolean(searchParams.get("semester"));
    let referenceDate: Date | undefined;
    if (!hasFilters) {
      const latestEvent = await Event.findOne({ status: { $ne: "cancelled" } })
        .sort({ startTime: -1 })
        .select("startTime")
        .lean<{ startTime?: Date }>();
      if (latestEvent?.startTime) {
        referenceDate = new Date(latestEvent.startTime);
      }
    }
    const semesterRange = parseSemesterRange({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      semester: searchParams.get("semester"),
      referenceDate,
    });

    const now = new Date();
    const events = await Event.find({
      startTime: { $gte: semesterRange.startDate, $lte: semesterRange.endDate },
      status: { $ne: "cancelled" },
    })
      .select("committeeId attendees startTime eventType status gemCategory")
      .lean();

interface MemberLean {
  _id: mongoose.Types.ObjectId;
  rollNo?: string;
  fName?: string;
  lName?: string;
  status?: string;
  role?: string;
}

const members = await Member.find({ status: "Active" })
  .select("rollNo fName lName status role")
  .lean<MemberLean[]>();
    if (
      viewerId &&
      !members.some((member) => member._id?.toString() === viewerId)
    ) {
      const viewerDoc = await Member.findById(viewerId).lean();
      if (viewerDoc) {
        members.push(viewerDoc as typeof members[number]);
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

    const memberStats = new Map<string, ReturnType<typeof getDefaultMemberStats>>();
    members.forEach((member) => {
      const memberId = member._id?.toString();
      if (!memberId) return;
      memberStats.set(memberId, getDefaultMemberStats());
    });

    const committeeTotals = new Map<string, number>();
    let generalTotal = 0;

    events.forEach((event) => {
      const startTime = event.startTime ? new Date(event.startTime) : null;
      if (!startTime) return;
      if (startTime > now && event.status !== "completed") return;
      const category = resolveEventGemCategory(event);
      if (!category) return;
      if (category === "general-conference") {
        generalTotal += 1;
      }
      const committeeId = event.committeeId ? event.committeeId.toString() : null;
      if (category === "committee-meeting" && committeeId) {
        const current = committeeTotals.get(committeeId) || 0;
        committeeTotals.set(committeeId, current + 1);
      }

      const attendeeIds = new Set<string>();
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      attendees.forEach((attendee) => {
        const id = extractMemberId(attendee?.memberId);
        if (id) {
          attendeeIds.add(id);
        }
      });

      attendeeIds.forEach((memberId) => {
        const stats = memberStats.get(memberId);
        if (!stats) return;
        switch (category) {
          case "general-conference":
            stats.general += 1;
            break;
          case "pillar-brotherhood":
            stats.brotherhood += 1;
            break;
          case "pillar-service":
            stats.service += 1;
            break;
          case "pillar-professionalism":
            stats.professionalism += 1;
            break;
          case "rush-event":
            stats.rushEvent += 1;
            break;
          case "rush-tabling":
            stats.rushTabling += 1;
            break;
          case "fso-event":
            stats.fso += 1;
            break;
          case "lock-in":
            stats.lockIn += 1;
            break;
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

    const memberIdsForGpa = filteredMembers.map((member) => member._id.toString());
    const gemRecords = await GemRecord.find({
      memberId: { $in: memberIdsForGpa },
      semester: semesterRange.name,
    }).lean();
    const gemRecordByMember = new Map(
      gemRecords.map((record: any) => [record.memberId?.toString(), record])
    );

    const generalTarget = generalTotal > 0 ? Math.ceil(generalTotal / 3) : 0;

    const membersOutput = filteredMembers
      .map((member) => {
        const memberId = member._id.toString();
        const stats = memberStats.get(memberId) || getDefaultMemberStats();
        const committeeMemberships = committeeMembership.get(memberId) || [];
        const committeeDetails = committeeMemberships.map((committee) => {
          const totalMeetings = committeeTotals.get(committee.id) || 0;
          const attended = stats.committeeAttendance.get(committee.id) || 0;
          const required =
            totalMeetings > 0 ? Math.floor(totalMeetings / 2) + 1 : 1;
          const satisfied = totalMeetings > 0 ? attended >= required : false;
          return {
            id: committee.id,
            name: committee.name,
            totalMeetings,
            attended,
            required,
            satisfied,
          };
        });
        const committeeSatisfied = committeeDetails.every((detail) => detail.satisfied);
        const brotherhoodSatisfied = stats.brotherhood > 0;
        const serviceSatisfied = stats.service > 0;
        const professionalismSatisfied = stats.professionalism > 0;
        const rushTotal = stats.rushEvent + stats.rushTabling;
        const rushSatisfied = rushTotal >= RUSH_TARGET;
        const fsoSatisfied = stats.fso > 0;
        const lockInSatisfied = stats.lockIn > 0;
        const generalSatisfied =
          generalTotal > 0 ? stats.general >= generalTarget : false;
        const gpaRecord = gemRecordByMember.get(memberId);
        const gpaValue =
          gpaRecord && typeof gpaRecord.gpa === "number" ? gpaRecord.gpa : null;
        const gpaSatisfied =
          typeof gpaValue === "number" && gpaValue >= GEM_GPA_THRESHOLD;

        const satisfiedRequirements: string[] = [];
        if (generalSatisfied) satisfiedRequirements.push("generalConference");
        if (committeeSatisfied) satisfiedRequirements.push("committeeMeetings");
        if (brotherhoodSatisfied) satisfiedRequirements.push("brotherhood");
        if (serviceSatisfied) satisfiedRequirements.push("service");
        if (professionalismSatisfied) satisfiedRequirements.push("professionalism");
        if (rushSatisfied) satisfiedRequirements.push("rush");
        if (fsoSatisfied) satisfiedRequirements.push("fso");
        if (lockInSatisfied) satisfiedRequirements.push("lockIn");
        if (gpaSatisfied) satisfiedRequirements.push("gpa");

        return {
          memberId,
          role: member.role || "member",
          rollNo: member.rollNo,
          fName: member.fName,
          lName: member.lName,
          status: member.status,
          committees: committeeMemberships.map((c) => c.name),
          committeeIds: committeeMemberships.map((c) => c.id),
          generalTarget,
          generalTotal,
          gem: {
            general: {
              attended: stats.general,
              total: generalTotal,
              required: generalTarget,
              satisfied: generalSatisfied,
            },
            committee: {
              satisfied: committeeSatisfied,
              details: committeeDetails,
            },
            brotherhood: {
              attended: stats.brotherhood,
              satisfied: brotherhoodSatisfied,
            },
            service: {
              attended: stats.service,
              satisfied: serviceSatisfied,
            },
            professionalism: {
              attended: stats.professionalism,
              satisfied: professionalismSatisfied,
            },
            rush: {
              eventCount: stats.rushEvent,
              tablingCount: stats.rushTabling,
              total: rushTotal,
              required: RUSH_TARGET,
              satisfied: rushSatisfied,
            },
            fso: {
              attended: stats.fso,
              satisfied: fsoSatisfied,
            },
            lockIn: {
              attended: stats.lockIn,
              satisfied: lockInSatisfied,
            },
            gpa: {
              value: gpaValue,
              threshold: GEM_GPA_THRESHOLD,
              satisfied: gpaSatisfied,
              recordId: gpaRecord?._id?.toString?.() || null,
            },
          },
          satisfiedRequirements,
          totalSatisfied: satisfiedRequirements.length,
          hasCompletedGem: satisfiedRequirements.length >= 5,
          gemRecordUpdatedAt: gpaRecord?.updatedAt || null,
        };
      })
      .sort((a, b) => (a.rollNo || "").localeCompare(b.rollNo || ""));

    return NextResponse.json(
      {
        semesterName: semesterRange.name,
        startDate: semesterRange.startDate.toISOString(),
        endDate: semesterRange.endDate.toISOString(),
        generalTotal,
        generalTarget,
        rushTarget: RUSH_TARGET,
        members: membersOutput,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch GEM status");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const viewer = await getViewer(req);
    if (!isPrivileged(viewer)) {
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

    const semesterRange = parseSemesterRange({
      semester: body?.semester,
    });

    let normalizedGpa: number | null = null;
    if (body?.gpa === null) {
      normalizedGpa = null;
    } else if (body?.gpa !== undefined) {
      normalizedGpa = Number(body.gpa);
      if (Number.isNaN(normalizedGpa)) {
        return NextResponse.json({ error: "Invalid GPA" }, { status: 400 });
      }
      if (normalizedGpa < 0 || normalizedGpa > 4) {
        return NextResponse.json({ error: "GPA must be between 0.0 and 4.0" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "gpa is required" }, { status: 400 });
    }

    const record = await GemRecord.findOneAndUpdate(
      { memberId: member._id, semester: semesterRange.name },
      { $set: { gpa: normalizedGpa } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ record }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update GEM GPA");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
