// lib/mcp/tools/events.ts
// Event tools. Reads go through `listEventsFor` / `loadEventDetail` and writes
// through `createEventAs` / `updateEventAs` / `deleteEventAs`, the same
// functions behind `/api/events`, so visibility, permission and every side
// effect (calendar sync, series reconciliation, announcements) are the
// website's. Start, end and cancel are status edits, exactly as the website's
// buttons send them.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Committee from "@/lib/models/Committee";
import Event from "@/lib/models/Event";
import { advanceEventLifecycle } from "@/lib/eventLifecycle";
import { createEventAs } from "@/lib/events/createEvent";
import { loadEventDetail } from "@/lib/events/eventDetail";
import { listEventsFor } from "@/lib/events/listEvents";
import { isAdminActor } from "@/lib/events/permissions";
import { deleteEventAs, updateEventAs } from "@/lib/events/updateEvent";
import {
  DESTRUCTIVE,
  READ_ONLY,
  ToolError,
  WRITE,
  WRITE_IDEMPOTENT,
  defineTool,
  type McpContext,
} from "@/lib/mcp/tool";
import { fullName, isObjectId, requireCommittee } from "@/lib/mcp/resolve";

const STATUSES = ["scheduled", "ongoing", "completed", "cancelled"] as const;
const EVENT_TYPES = ["event", "meeting", "chapter"] as const;
const GEM_HINT =
  "GEM category for the event, if it counts toward one. Omit when unsure.";

const dateText = z
  .string()
  .describe("ISO 8601 date-time, for example 2026-11-05T19:00:00-07:00. Arizona time (no daylight saving) if no offset is given by the user.");

const recurrenceInput = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    interval: z.number().int().min(1).max(52).default(1).describe("Every N days, weeks or months."),
    endDate: z.string().describe("Last day the series may repeat, ISO date. Required; a series is created in full up to this date, at most one year out."),
  })
  .describe("Makes the event repeat. Omit for a one-off event.");

function parseDate(label: string, value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ToolError(`${label} "${value}" is not a valid date. Use ISO 8601, like 2026-11-05T19:00:00-07:00.`);
  }
  return date;
}

async function committeeNames(ids: unknown[]) {
  const unique = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (!unique.length) return new Map<string, string>();
  const rows = await Committee.find({ _id: { $in: unique } }).select("name").lean<any[]>();
  return new Map(rows.map((row) => [String(row._id), row.name as string]));
}

function iso(value: unknown) {
  return value ? new Date(value as any).toISOString() : null;
}

function summarize(event: any, names: Map<string, string>) {
  const committeeId = event.committeeId ? String(event.committeeId) : null;
  return {
    id: String(event._id),
    name: event.name,
    status: event.status,
    eventType: event.eventType,
    startTime: iso(event.startTime),
    endTime: iso(event.endTime),
    committee: committeeId
      ? { id: committeeId, name: names.get(committeeId) ?? null }
      : "chapter-wide",
    location: event.location || null,
    locationKind: event.locationKind ?? "physical",
    virtualLink: event.virtualLink || undefined,
    attendeeCount: Array.isArray(event.attendees) ? event.attendees.length : 0,
    recurring: event.recurrence?.enabled
      ? {
          frequency: event.recurrence.frequency,
          interval: event.recurrence.interval,
          endDate: iso(event.recurrence.endDate),
        }
      : event.recurrenceParentId
      ? { seriesParentId: String(event.recurrenceParentId) }
      : false,
    canManage: !!event.canManage,
    canDelete: !!event.canDelete,
  };
}

async function loadVisibleDetail(ctx: McpContext, id: string) {
  if (!isObjectId(id)) throw new ToolError(`"${id}" is not an event id. Use list_events to find one.`);
  const detail = await loadEventDetail(ctx.member, id);
  // Alumni only ever see what is flagged for them, here as in the list.
  if (!detail || (ctx.member.status === "Alumni" && !detail.visibleToAlumni)) {
    throw new ToolError("Event not found.");
  }
  return detail;
}

function refusal(result: { status: number; error: string }): never {
  throw new ToolError(
    result.status === 403
      ? `Not allowed: ${result.error}. Your role on the website does not permit this on this event.`
      : result.error
  );
}

/// Runs a status edit through `updateEventAs` and unwraps it.
async function setStatus(
  ctx: McpContext,
  eventId: string,
  status: (typeof STATUSES)[number],
  applyToSeries: "single" | "series" = "single"
) {
  const result = await updateEventAs(ctx.member, eventId, { status, applyToSeries });
  if (!result.ok) refusal(result);
  return result.value;
}

async function currentStatus(eventId: string) {
  if (!isObjectId(eventId)) throw new ToolError(`"${eventId}" is not an event id.`);
  const event = await Event.findById(eventId).select("status name").lean<any>();
  if (!event) throw new ToolError("Event not found.");
  return event as { status: string; name: string };
}

export function registerEventTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "list_events", {
    title: "List events",
    description:
      "List chapter and committee events you can see, soonest first. By default only events that have not ended yet; pass includePast or a from/to range for history. Each row says whether you can manage or delete it.",
    input: {
      status: z.enum(STATUSES).optional().describe("Only events in this status."),
      committee: z.string().optional().describe("Committee name or id."),
      from: z.string().optional().describe("Events starting on or after this date (ISO). Replaces the 'not ended yet' default."),
      to: z.string().optional().describe("Events starting on or before this date (ISO)."),
      search: z.string().optional().describe("Matches the name, description or location."),
      includePast: z.boolean().optional().describe("Include events that already ended."),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: READ_ONLY,
    run: async (args, c) => {
      const committee = args.committee ? await requireCommittee(args.committee) : null;
      const events = await listEventsFor(c.member, {
        committeeId: committee ? String(committee._id) : null,
        includePast: args.includePast === true,
        statuses: args.status ? [args.status] : [],
        from: args.from ? parseDate("from", args.from) : null,
        to: args.to ? parseDate("to", args.to) : null,
        search: args.search,
        limit: args.limit ?? 25,
      });
      const names = await committeeNames(events.map((event: any) => event.committeeId));
      return { count: events.length, events: events.map((event: any) => summarize(event, names)) };
    },
  });

  defineTool(server, ctx, "get_event", {
    title: "Get an event",
    description:
      "One event in full, including who checked in (attendees with name, roll number, time and how) and your own permissions on it.",
    input: { eventId: z.string().describe("Event id from list_events.") },
    annotations: READ_ONLY,
    run: async ({ eventId }, c) => {
      const detail = await loadVisibleDetail(c, eventId);
      const names = await committeeNames([detail.committeeId]);
      const attendees = (detail.attendees || []).map((entry: any) => {
        const person = entry?.memberId && typeof entry.memberId === "object" ? entry.memberId : null;
        return {
          memberId: person ? String(person._id) : entry?.memberId ? String(entry.memberId) : null,
          name: person ? fullName(person) : null,
          rollNo: person?.rollNo ?? null,
          checkedInAt: iso(entry?.checkedInAt),
          source: entry?.source ?? null,
        };
      });
      return {
        ...summarize(detail, names),
        description: detail.description || "",
        gemCategory: detail.gemCategory ?? null,
        visibleToAlumni: detail.visibleToAlumni,
        startedAt: iso(detail.startedAt),
        endedAt: iso(detail.endedAt),
        emailGroups: detail.emailGroups,
        rsvpCount: Array.isArray(detail.rsvps) ? detail.rsvps.length : 0,
        attendeeCount: attendees.length,
        attendees,
      };
    },
  });

  defineTool(server, ctx, "create_event", {
    title: "Create an event",
    description:
      "Put an event on the calendar. Admins and E-Council may create chapter-wide events (omit committee) or any committee's; a committee head or roster member may create events for their own committee. Creating announces the event to members exactly as the website does. Pass recurrence to repeat it.",
    input: {
      name: z.string().min(1).max(200),
      startTime: dateText,
      endTime: dateText,
      committee: z.string().optional().describe("Committee name or id. Omit for a chapter-wide event."),
      description: z.string().max(5000).optional(),
      location: z.string().max(300).optional().describe("Address, or the room name for a virtual event."),
      locationKind: z.enum(["physical", "virtual"]).optional(),
      virtualPlatform: z.enum(["discord", "zoom", "meet", "teams", "other"]).optional(),
      virtualLink: z.string().max(500).optional(),
      eventType: z.enum(EVENT_TYPES).optional().describe("meeting, chapter or event (default event)."),
      gemCategory: z.string().optional().describe(GEM_HINT),
      visibleToAlumni: z.boolean().optional().describe("Default true."),
      emailActives: z.boolean().optional().describe("Email the actives Google Group about it."),
      emailAlumni: z.boolean().optional().describe("Email the alumni Google Group (only if visible to alumni)."),
      recurrence: recurrenceInput.optional(),
    },
    annotations: WRITE,
    run: async (args, c) => {
      const startTime = parseDate("startTime", args.startTime);
      const endTime = parseDate("endTime", args.endTime);
      if (endTime <= startTime) throw new ToolError("endTime has to be after startTime.");
      const committee = args.committee ? await requireCommittee(args.committee) : null;

      const result = await createEventAs(c.member, {
        name: args.name,
        description: args.description ?? "",
        committeeId: committee ? String(committee._id) : null,
        startTime,
        endTime,
        location: args.location ?? "",
        locationKind: args.locationKind,
        virtualPlatform: args.virtualPlatform,
        virtualLink: args.virtualLink,
        eventType: args.eventType ?? "event",
        gemCategory: args.gemCategory,
        status: "scheduled",
        visibleToAlumni: args.visibleToAlumni ?? true,
        emailGroups:
          args.emailActives || args.emailAlumni
            ? { actives: !!args.emailActives, alumni: !!args.emailAlumni }
            : null,
        recurrence: args.recurrence
          ? { enabled: true, ...args.recurrence }
          : {},
      });
      if (!result.ok) {
        throw new ToolError(
          result.status === 403
            ? "Not allowed: only admins and E-Council can create chapter-wide events, and only admins, E-Council, or a committee's own head or members can create that committee's events."
            : result.error
        );
      }
      const event = result.value;
      const names = await committeeNames([event.committeeId]);
      const seriesCount = event.recurrence?.enabled
        ? 1 + (await Event.countDocuments({ recurrenceParentId: event._id }))
        : undefined;
      return {
        created: summarize({ ...event, canManage: true, canDelete: true }, names),
        ...(seriesCount ? { seriesOccurrences: seriesCount } : {}),
      };
    },
  });

  defineTool(server, ctx, "update_event", {
    title: "Edit an event",
    description:
      "Change an event you manage (admins, E-Council, or the head of its committee). Only the fields you pass change. applyToSeries 'series' also applies name, description, location, type and time-of-day changes to the future occurrences of a repeating event. Only admins can move an event to another committee.",
    input: {
      eventId: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      startTime: dateText.optional(),
      endTime: dateText.optional(),
      location: z.string().max(300).optional(),
      locationKind: z.enum(["physical", "virtual"]).optional(),
      virtualPlatform: z.enum(["discord", "zoom", "meet", "teams", "other"]).optional(),
      virtualLink: z.string().max(500).optional(),
      eventType: z.enum(EVENT_TYPES).optional(),
      gemCategory: z.string().nullable().optional().describe(GEM_HINT + " Null clears it."),
      visibleToAlumni: z.boolean().optional(),
      committee: z.string().nullable().optional().describe("Admins only. Committee name or id, or null for chapter-wide."),
      recurrence: z
        .object({
          enabled: z.boolean(),
          frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
          interval: z.number().int().min(1).max(52).optional(),
          endDate: z.string().optional(),
        })
        .optional()
        .describe("Change the repeat settings. Only on the first event of a series."),
      applyToSeries: z.enum(["single", "series"]).default("single"),
    },
    annotations: WRITE_IDEMPOTENT,
    run: async (args, c) => {
      if (!isObjectId(args.eventId)) throw new ToolError(`"${args.eventId}" is not an event id.`);
      // Built key by key: the edit treats "this key is present" as "change it".
      const updates: any = { applyToSeries: args.applyToSeries };
      for (const key of ["name", "description", "location", "eventType", "visibleToAlumni"] as const) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      if (args.startTime !== undefined) updates.startTime = parseDate("startTime", args.startTime).toISOString();
      if (args.endTime !== undefined) updates.endTime = parseDate("endTime", args.endTime).toISOString();
      if (args.gemCategory !== undefined) updates.gemCategory = args.gemCategory;
      if (args.recurrence !== undefined) updates.recurrence = args.recurrence;
      if (args.committee !== undefined) {
        updates.committeeId = args.committee === null ? null : String((await requireCommittee(args.committee))._id);
      }
      if (
        args.locationKind !== undefined ||
        args.virtualPlatform !== undefined ||
        args.virtualLink !== undefined
      ) {
        // The where-fields are normalised together, keyed on locationKind, so
        // a link sent alone has to carry the event's current kind with it.
        const existing = await Event.findById(args.eventId).select("locationKind").lean<any>();
        updates.locationKind = args.locationKind ?? existing?.locationKind ?? "physical";
        if (args.virtualPlatform !== undefined) updates.virtualPlatform = args.virtualPlatform;
        if (args.virtualLink !== undefined) updates.virtualLink = args.virtualLink;
      }

      const result = await updateEventAs(c.member, args.eventId, updates);
      if (!result.ok) refusal(result);
      const names = await committeeNames([result.value.committeeId]);
      return { updated: summarize(result.value, names) };
    },
  });

  defineTool(server, ctx, "start_event", {
    title: "Start an event",
    description:
      "Mark a scheduled event as ongoing, which opens check-in and sends the 'event started' notification, exactly like the Start button. Requires managing the event.",
    input: { eventId: z.string() },
    annotations: WRITE_IDEMPOTENT,
    run: async ({ eventId }, c) => {
      const current = await currentStatus(eventId);
      if (current.status !== "scheduled") {
        throw new ToolError(`"${current.name}" is ${current.status}; only a scheduled event can be started.`);
      }
      const event = await setStatus(c, eventId, "ongoing");
      return { started: summarize(event, await committeeNames([event.committeeId])) };
    },
  });

  defineTool(server, ctx, "end_event", {
    title: "End an event",
    description:
      "Mark an ongoing (or still scheduled) event as completed and close check-in. Requires managing the event.",
    input: { eventId: z.string() },
    annotations: WRITE_IDEMPOTENT,
    run: async ({ eventId }, c) => {
      const current = await currentStatus(eventId);
      if (current.status !== "ongoing" && current.status !== "scheduled") {
        throw new ToolError(`"${current.name}" is already ${current.status}.`);
      }
      const event = await setStatus(c, eventId, "completed");
      return { ended: summarize(event, await committeeNames([event.committeeId])) };
    },
  });

  defineTool(server, ctx, "cancel_event", {
    title: "Cancel an event",
    description:
      "Cancel an event you manage. It stays on record as cancelled and is removed from the shared calendar. applyToSeries 'series' also cancels the future occurrences of a repeating event.",
    input: {
      eventId: z.string(),
      applyToSeries: z.enum(["single", "series"]).default("single"),
    },
    annotations: DESTRUCTIVE,
    run: async ({ eventId, applyToSeries }, c) => {
      const current = await currentStatus(eventId);
      if (current.status === "cancelled") throw new ToolError(`"${current.name}" is already cancelled.`);
      const event = await setStatus(c, eventId, "cancelled", applyToSeries);
      return { cancelled: summarize(event, await committeeNames([event.committeeId])) };
    },
  });

  defineTool(server, ctx, "delete_event", {
    title: "Delete an event",
    description:
      "Permanently delete an event and its calendar entry. Cannot be undone. Anyone who manages an event may delete it, except a completed event with a roll attached, which only an admin can delete. Prefer cancel_event if members should still see that it was cancelled.",
    input: { eventId: z.string() },
    annotations: DESTRUCTIVE,
    run: async ({ eventId }, c) => {
      if (!isObjectId(eventId)) throw new ToolError(`"${eventId}" is not an event id.`);
      const result = await deleteEventAs(c.member, eventId);
      if (!result.ok) refusal(result);
      return { deleted: eventId };
    },
  });

  defineTool(server, ctx, "retire_stale_events", {
    title: "Run the event lifecycle sweep",
    description:
      "Admins only. Runs the same sweep the server runs every minute: scheduled events whose time has come become ongoing, and events more than two hours past their end are completed. Reports how many of each. Safe to repeat.",
    input: {},
    annotations: WRITE_IDEMPOTENT,
    run: async (_args, c) => {
      if (!isAdminActor(c.member)) {
        throw new ToolError("Not allowed: only admins can run the lifecycle sweep.");
      }
      return advanceEventLifecycle();
    },
  });
}
