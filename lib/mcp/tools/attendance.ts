// lib/mcp/tools/attendance.ts
// The roll. Writing it needs `canManageCheckIn`, the same check as the
// website's manual check-in; the writes themselves are
// `lib/events/attendance.ts`, shared with those routes.
import { z } from "zod";
import mongoose from "mongoose";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Event from "@/lib/models/Event";
import { canManageCheckIn } from "@/lib/checkinAuth";
import {
  existingMemberIds,
  memberAttendanceFor,
  pushManualCheckIns,
  removeCheckIn,
} from "@/lib/events/attendance";
import { loadEventDetail } from "@/lib/events/eventDetail";
import {
  DESTRUCTIVE,
  READ_ONLY,
  ToolError,
  WRITE_IDEMPOTENT,
  defineTool,
  type McpContext,
} from "@/lib/mcp/tool";
import { fullName, isObjectId, requireMember, resolveMember } from "@/lib/mcp/resolve";

/// The raw event row, the shape `canManageCheckIn` is given by the routes.
async function rawEventForRoll(eventId: string) {
  if (!isObjectId(eventId)) throw new ToolError(`"${eventId}" is not an event id.`);
  const id = new mongoose.Types.ObjectId(eventId);
  const event = await Event.collection.findOne({ _id: id });
  if (!event) throw new ToolError("Event not found.");
  return { id, event };
}

async function requireRollAccess(ctx: McpContext, event: any) {
  if (!(await canManageCheckIn(ctx.member, event))) {
    throw new ToolError(
      "Not allowed: only admins, E-Council, or the head of the event's committee can change its attendance."
    );
  }
}

export function registerAttendanceTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "list_attendance", {
    title: "List attendance",
    description:
      "Two modes. With eventId: who checked in to that event (name, roll number, time, how). With member (id, roll number or full name) and optional from/to dates: the events that member attended. Admins and E-Council get the event list; anyone else gets only the count, as on the website.",
    input: {
      eventId: z.string().optional(),
      member: z.string().optional().describe("Member id, roll number or full name."),
      from: z.string().optional().describe("ISO date. Member mode only."),
      to: z.string().optional().describe("ISO date. Member mode only."),
    },
    annotations: READ_ONLY,
    run: async (args, c) => {
      if (!args.eventId === !args.member) {
        throw new ToolError("Pass exactly one of eventId or member.");
      }

      if (args.eventId) {
        if (!isObjectId(args.eventId)) throw new ToolError(`"${args.eventId}" is not an event id.`);
        const detail = await loadEventDetail(c.member, args.eventId);
        if (!detail || (c.member.status === "Alumni" && !detail.visibleToAlumni)) {
          throw new ToolError("Event not found.");
        }
        const attendees = (detail.attendees || []).map((entry: any) => {
          const person = entry?.memberId && typeof entry.memberId === "object" ? entry.memberId : null;
          return {
            memberId: person ? String(person._id) : null,
            name: person ? fullName(person) : null,
            rollNo: person?.rollNo ?? null,
            checkedInAt: entry?.checkedInAt ? new Date(entry.checkedInAt).toISOString() : null,
            source: entry?.source ?? null,
          };
        });
        return { event: detail.name, count: attendees.length, attendees };
      }

      const target = await requireMember(args.member!);
      const parse = (label: string, value?: string) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new ToolError(`${label} "${value}" is not a valid date.`);
        return date;
      };
      const result = await memberAttendanceFor(
        c.member,
        String(target._id),
        parse("from", args.from),
        parse("to", args.to)
      );
      return { member: fullName(target), rollNo: target.rollNo, ...result };
    },
  });

  defineTool(server, ctx, "add_attendees", {
    title: "Add attendees to an event",
    description:
      "Put members on an event's roll as manual check-ins. Requires managing the event (admins, E-Council, or its committee's head). Each member may be an id, a roll number or a full name; names that match more than one person are not guessed and are reported back. People already on the roll are skipped.",
    input: {
      eventId: z.string(),
      members: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe("Member ids, roll numbers or full names."),
    },
    annotations: WRITE_IDEMPOTENT,
    run: async ({ eventId, members }, c) => {
      const { id, event } = await rawEventForRoll(eventId);
      await requireRollAccess(c, event);

      const resolved = new Map<string, string>();
      const unresolved: { input: string; reason: string }[] = [];
      for (const ref of members as string[]) {
        const match = await resolveMember(ref);
        if (!match.ok) {
          unresolved.push({ input: ref, reason: match.reason });
        } else if (match.member.status === "Removed" || match.member.status === "Deceased") {
          unresolved.push({ input: ref, reason: `member is ${match.member.status}` });
        } else {
          resolved.set(String(match.member._id), fullName(match.member));
        }
      }

      const ids = Array.from(resolved.keys());
      const existing = await existingMemberIds(ids);
      const added = await pushManualCheckIns({
        eventId: id,
        memberIds: ids,
        existingIds: existing,
        actorId: c.member._id,
      });
      return {
        event: event.name,
        added,
        alreadyOnRoll: ids.length - added,
        unresolved,
      };
    },
  });

  defineTool(server, ctx, "remove_attendee", {
    title: "Remove an attendee",
    description:
      "Take one member off an event's roll (for example a mis-scan). Requires managing the event. Attendance counts toward GEM, so this changes records.",
    input: {
      eventId: z.string(),
      member: z.string().describe("Member id, roll number or full name."),
    },
    annotations: DESTRUCTIVE,
    run: async ({ eventId, member }, c) => {
      const { id, event } = await rawEventForRoll(eventId);
      await requireRollAccess(c, event);
      const target = await requireMember(member);
      const removed = await removeCheckIn(id, String(target._id));
      return removed
        ? { removed: fullName(target), event: event.name }
        : { removed: null, note: `${fullName(target)} was not on the roll for ${event.name}.` };
    },
  });
}
