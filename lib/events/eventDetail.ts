// lib/events/eventDetail.ts
// One event, the way the website shows it: attendees resolved to people, the
// stored recurrence repaired when a stale compiled schema dropped it, and the
// viewer's own `canManage` / `canDelete` riding along.
//
// This was the body of `GET /api/events/[id]`. The MCP `get_event` tool reads
// the same thing, so it lives here and both call it.
import mongoose from "mongoose";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import { resolveEventAccess } from "@/lib/events/permissions";

/// `viewer` may be null (a signed-in caller with no member row still gets to
/// read the event on the website, with no management rights).
export async function loadEventDetail(viewer: any | null, id: string) {
  const event = await Event.findById(id)
    .populate("attendees.memberId", "fName lName rollNo")
    .lean();
  if (!event) return null;
  const eventId = (event as any)._id ?? (event as any).id;
  if (!(event as any).recurrence) {
    const raw = await Event.collection.findOne({ _id: eventId });
    if (raw?.recurrence) {
      (event as any).recurrence = raw.recurrence;
    }
  }
  if (Array.isArray((event as any).attendees)) {
    const ids = (event as any).attendees
      .map((entry: any) => {
        if (entry?.memberId && typeof entry.memberId === "object") {
          if (Array.isArray(entry.memberId)) {
            const first = entry.memberId[0];
            return first?._id || first;
          }
          return entry.memberId._id || entry.memberId;
        }
        return entry?.memberId || entry;
      })
      .filter(Boolean)
      .map((id: any) => id.toString())
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

    if (ids.length) {
      const members = await Member.find(
        { _id: { $in: ids } },
        { fName: 1, lName: 1, rollNo: 1 }
      ).lean();
      const memberMap = new Map(
        members.map((m: any) => [m._id.toString(), m])
      );

      (event as any).attendees = (event as any).attendees.map((entry: any) => {
        let raw;
        if (entry?.memberId && typeof entry.memberId === "object") {
          if (Array.isArray(entry.memberId)) {
            const first = entry.memberId[0];
            raw = first?._id || first;
          } else {
            raw = entry.memberId._id || entry.memberId;
          }
        } else {
          raw = entry?.memberId || entry;
        }
        const key = raw ? raw.toString() : "";
        const member = key ? memberMap.get(key) : null;
        const memberIdValue = Array.isArray(entry.memberId)
          ? entry.memberId[0]
          : entry.memberId;
        if (member) {
          return {
            ...entry,
            memberId: {
              _id: member._id,
              fName: member.fName,
              lName: member.lName,
              rollNo: member.rollNo,
            },
          };
        }
        return {
          ...entry,
          memberId: memberIdValue,
        };
      });
    }
  }
  const access = viewer
    ? await resolveEventAccess(viewer, event)
    : { canManage: false, canDelete: false };
  return { ...event, ...access } as any;
}
