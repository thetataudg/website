// lib/events/attendance.ts
// Writing and reading the roll, below the permission check.
//
// The manual check-in routes and the MCP attendance tools both put people on
// an event's roll and take them off again. The write is the delicate part (the
// `$ne` guard that keeps a double tap from listing someone twice, and the
// repair for a legacy non-array `attendees`), so it is here once. Callers do
// their own `canManageCheckIn` first.
import mongoose from "mongoose";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import { canonicalCheckInSource } from "@/lib/checkinSource";

/// Which of `ids` are real members. Ids must already be valid ObjectIds.
export async function existingMemberIds(ids: string[]): Promise<Set<string>> {
  const existing = await Member.find({ _id: { $in: ids } })
    .select("_id")
    .lean<any[]>();
  return new Set(existing.map((m) => m._id.toString()));
}

/// Puts each of `memberIds` on the roll as a hand-added check-in. Ids that are
/// not in `existingIds` are skipped. Returns how many were newly added (people
/// already on the roll are not counted).
export async function pushManualCheckIns(opts: {
  eventId: mongoose.Types.ObjectId;
  memberIds: string[];
  existingIds: Set<string>;
  actorId: any;
}): Promise<number> {
  const { eventId, memberIds, existingIds, actorId } = opts;
  // Decided here, not by the caller. The website used to post "Phone" for a
  // hand-added member, which put them on the roster as a scan.
  const checkInSource = canonicalCheckInSource("manual");

  const event = await Event.collection.findOne({ _id: eventId });
  if (event?.attendees && !Array.isArray(event.attendees)) {
    await Event.collection.updateOne(
      { _id: eventId },
      { $set: { attendees: [] } }
    );
  }

  const scannerId =
    typeof actorId === "string" && mongoose.Types.ObjectId.isValid(actorId)
      ? new mongoose.Types.ObjectId(actorId)
      : null;

  // One conditional push per member rather than a single $push of the lot:
  // the `$ne` guard is what keeps a double tap, or two officers on two
  // laptops, from putting the same person on the roll twice.
  let added = 0;
  for (const id of memberIds) {
    if (!existingIds.has(id)) continue;
    const targetId = new mongoose.Types.ObjectId(id);
    const update = await Event.updateOne(
      {
        _id: eventId,
        "attendees.memberId": { $ne: targetId },
      },
      {
        $push: {
          attendees: {
            memberId: targetId,
            checkedInAt: new Date(),
            source: checkInSource,
            scannerMemberId: scannerId,
          },
        },
      }
    );
    if (update.matchedCount > 0) added += 1;
  }
  return added;
}

/// Takes somebody off the roll. True when they were on it.
export async function removeCheckIn(
  eventId: mongoose.Types.ObjectId,
  memberId: string
): Promise<boolean> {
  const targetId = new mongoose.Types.ObjectId(memberId);
  const update = await Event.collection.updateOne(
    { _id: eventId },
    { $pull: { attendees: { memberId: targetId } } } as any
  );
  return update.modifiedCount > 0;
}

/// A member's attendance, over an optional date range.
///
/// This was the body of `GET /api/events/attendance`. Officers (admin or
/// E-Council) get the events; anyone else gets only the count, which is all
/// the website ever showed them.
export async function memberAttendanceFor(
  viewer: any,
  memberId: string,
  startDate: Date | null,
  endDate: Date | null
): Promise<{ total: number } | { events: any[] }> {
  const range: Record<string, Date> = {};
  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
    range.$gte = startDate;
  }
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
    range.$lte = endDate;
  }

  const memberObjectId = new mongoose.Types.ObjectId(memberId);
  const attendeeIdMatch = { $in: [memberObjectId, memberId] };

  // Use raw collection queries to avoid schema casting errors on legacy data.
  const rawFilter: any = {
    $or: [
      { "attendees.memberId": attendeeIdMatch },
      { attendees: attendeeIdMatch },
    ],
  };

  const isPrivileged =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    viewer.isECouncil;

  const rawEvents = await Event.collection
    .find(rawFilter)
    .sort({ startTime: -1 })
    .toArray();

  const inRange = (date: Date | null) => {
    if (!Object.keys(range).length) return true;
    if (!date || Number.isNaN(date.getTime())) return false;
    if (range.$gte && date < range.$gte) return false;
    if (range.$lte && date > range.$lte) return false;
    return true;
  };

  const filtered = rawEvents.filter((event: any) => {
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const matchingEntry = attendees.find((entry: any) => {
      if (entry?.memberId?.toString?.() === memberId) return true;
      if (entry?.memberId === memberId) return true;
      if (entry?.toString?.() === memberId) return true;
      return false;
    });
    const checkedInAtRaw = matchingEntry?.checkedInAt || null;
    const checkedInAt = checkedInAtRaw ? new Date(checkedInAtRaw) : null;
    const eventDate = checkedInAt || (event.startTime ? new Date(event.startTime) : null);
    return inRange(eventDate);
  });

  if (!isPrivileged) {
    return { total: filtered.length };
  }

  const committeeIds = Array.from(
    new Set(
      filtered
        .map((event: any) => event.committeeId)
        .filter(Boolean)
        .map((id: any) => id.toString())
    )
  ).map((id: string) => new mongoose.Types.ObjectId(id));

  const committees = committeeIds.length
    ? await Committee.find({ _id: { $in: committeeIds } }, { name: 1 }).lean()
    : [];
  const committeeMap = new Map(
    committees.map((c: any) => [c._id.toString(), c.name])
  );

  const formatted = filtered.map((event: any) => {
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const checkedInEntry = attendees.find((entry: any) => {
      if (entry?.memberId?.toString?.() === memberId) return true;
      if (entry?.memberId === memberId) return true;
      if (entry?.toString?.() === memberId) return true;
      return false;
    });
    const checkedInAtRaw = checkedInEntry?.checkedInAt || null;
    const committeeId =
      event.committeeId ? event.committeeId.toString() : null;
    const committeeName = committeeId
      ? committeeMap.get(committeeId) || "Committee"
      : "Chapter";

    return {
      _id: event._id,
      name: event.name,
      startTime: event.startTime,
      eventType:
        event.eventType || (event.committeeId ? "event" : "chapter"),
      committeeId: committeeId,
      committeeName,
      checkedInAt: checkedInAtRaw,
    };
  });

  return { events: formatted };
}
