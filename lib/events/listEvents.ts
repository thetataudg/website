// lib/events/listEvents.ts
// The events a member may see, each with what that member may do to it.
//
// This was the body of `GET /api/events`. The MCP `list_events` tool needs the
// same visibility rule (alumni only see what is flagged for them) and the
// same per-row `canManage` / `canDelete`, plus a few filters the website never
// asked for, so it lives here. The extra filters are all optional: a call that
// passes only the original three behaves exactly as the route always did.
import Event from "@/lib/models/Event";
import {
  eventAccessFromHeadSet,
  headCommitteeIdsFor,
  isOfficerActor,
} from "@/lib/events/permissions";

export interface ListEventsOptions {
  committeeId?: string | null;
  includePast?: boolean;
  /// One status or several. Unknown values simply match nothing.
  statuses?: string[];
  /// Inclusive range on `startTime`. Giving either replaces the "not over yet"
  /// default that `includePast: false` applies, because a range is the caller
  /// saying which window they mean.
  from?: Date | null;
  to?: Date | null;
  /// Case-insensitive substring of the name, description or location.
  search?: string | null;
  limit?: number | null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listEventsFor(member: any, options: ListEventsOptions = {}) {
  const filter: any = {};
  if (options.committeeId) filter.committeeId = options.committeeId;

  const hasRange = !!(options.from || options.to);
  if (hasRange) {
    filter.startTime = {};
    if (options.from) filter.startTime.$gte = options.from;
    if (options.to) filter.startTime.$lte = options.to;
  } else if (!options.includePast) {
    filter.endTime = { $gte: new Date() };
  }

  const statuses = (options.statuses || []).filter(Boolean);
  if (statuses.length === 1) {
    filter.status = statuses[0];
  } else if (statuses.length > 1) {
    filter.status = { $in: statuses };
  }
  if (member.status === "Alumni") {
    filter.visibleToAlumni = true;
  }
  const search = options.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ name: pattern }, { description: pattern }, { location: pattern }];
  }

  let query = Event.find(filter).sort({ startTime: 1 });
  if (options.limit && options.limit > 0) query = query.limit(options.limit);
  const events = await query.lean();

  // What this viewer may do to each event travels with it, so the website
  // draws an Edit button exactly where the PATCH would succeed instead of
  // keeping its own copy of the rule. The viewer's head committees are read
  // once and every event is answered from memory: a list of a semester's
  // events must not become a query per row. Officers need no lookup at all.
  const headIds = isOfficerActor(member)
    ? new Set<string>()
    : await headCommitteeIdsFor(member);
  return events.map((event: any) => ({
    ...event,
    ...eventAccessFromHeadSet(member, event, headIds),
  }));
}
