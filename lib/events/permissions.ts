// lib/events/permissions.ts
// Who may change an event, decided in exactly one place.
//
// The rule used to live in three: `canManageEvent` in the event route,
// `canManageCheckIn` in the check-in helpers, and a client-side copy in
// `useEventsData` that the website's buttons were drawn from. They agreed on
// the day they were written and had already started to drift (the check-in
// page let admins and heads in but not E-Council, which the server allowed).
// The client now takes its answer from the server, which computes it here and
// sends `canManage` / `canDelete` along with every event it returns, so a
// button is shown if and only if the call behind it would succeed.
//
// The rule: admins and E-Council manage everything, including chapter-wide
// events. A committee's head manages that committee's events. A plain member
// of a committee can put things on its calendar (see `eventAuth.ts`) but
// cannot edit, delete, start, end or take the roll for them.
//
// Committee-head truth is `Committee.committeeHeadId`, never the
// `isCommitteeHead` boolean on Member, which has drifted from reality and is
// not trusted anywhere that grants permission.
import Committee from "@/lib/models/Committee";

export interface EventActor {
  _id?: any;
  role?: string | null;
  isECouncil?: boolean | null;
}

export interface EventAccess {
  canManage: boolean;
  canDelete: boolean;
}

export function isAdminActor(actor: EventActor | null | undefined): boolean {
  return actor?.role === "admin" || actor?.role === "superadmin";
}

/** Admin or E-Council: the people who may act on any event at all. */
export function isOfficerActor(actor: EventActor | null | undefined): boolean {
  return isAdminActor(actor) || !!actor?.isECouncil;
}

/**
 * The pure rule. `isHeadOfEventCommittee` is whether the actor heads the
 * committee this event belongs to, worked out by the caller (one committee
 * lookup for a single event, one lookup for a whole list).
 *
 * Deleting is stricter than managing: a finished event with a roll attached is
 * the only record that those members were there, so only an admin may remove
 * it. Everything else a manager can delete.
 */
export function eventAccess(
  actor: EventActor | null | undefined,
  event: { status?: string | null; attendees?: unknown } | null | undefined,
  isHeadOfEventCommittee: boolean
): EventAccess {
  const canManage = isOfficerActor(actor) || isHeadOfEventCommittee;
  if (!canManage) return { canManage: false, canDelete: false };

  const attendees = Array.isArray(event?.attendees) ? event!.attendees : [];
  const lockedByAttendance =
    event?.status === "completed" && (attendees as unknown[]).length > 0;
  return {
    canManage: true,
    canDelete: isAdminActor(actor) || !lockedByAttendance,
  };
}

/** The committees an actor is the head of, as a set of id strings. One query. */
export async function headCommitteeIdsFor(
  actor: EventActor | null | undefined
): Promise<Set<string>> {
  if (!actor?._id) return new Set();
  const committees = await Committee.find({ committeeHeadId: actor._id })
    .select("_id")
    .lean<any[]>();
  return new Set(committees.map((committee) => committee._id.toString()));
}

/** Access for one event, for the routes that act on a single event. */
export async function resolveEventAccess(
  actor: EventActor | null | undefined,
  event: any
): Promise<EventAccess> {
  if (isOfficerActor(actor)) return eventAccess(actor, event, false);
  if (!event?.committeeId || !actor?._id) return eventAccess(actor, event, false);

  const committee = await Committee.findById(event.committeeId)
    .select("committeeHeadId")
    .lean<any>();
  const isHead =
    !!committee?.committeeHeadId &&
    committee.committeeHeadId.toString() === actor._id.toString();
  return eventAccess(actor, event, isHead);
}

/** Access for a list of events, given the actor's head committees up front. */
export function eventAccessFromHeadSet(
  actor: EventActor | null | undefined,
  event: any,
  headCommitteeIds: Set<string>
): EventAccess {
  const isHead =
    !!event?.committeeId && headCommitteeIds.has(event.committeeId.toString());
  return eventAccess(actor, event, isHead);
}
