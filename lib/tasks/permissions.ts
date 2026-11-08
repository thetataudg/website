// lib/tasks/permissions.ts
// Who may see and change a committee's task tracker, decided in one place.
//
// Head truth is `Committee.committeeHeadId`, never `Member.isCommitteeHead`
// (see lib/events/permissions.ts). Outsiders get a 404, not a 403, so a task
// link does not even confirm that the task exists.
import { isAdminActor, isOfficerActor } from "@/lib/events/permissions";
import { notFound, forbidden } from "@/lib/httpError";

export interface TrackerActor {
  _id?: any;
  role?: string | null;
  isECouncil?: boolean | null;
}

export interface TrackerCommittee {
  _id?: any;
  committeeHeadId?: any;
  committeeMembers?: any[];
}

const idOf = (value: any): string =>
  value == null ? "" : String(value?._id ?? value);

export function isTrackerHead(actor: TrackerActor | null | undefined, committee: TrackerCommittee | null | undefined) {
  const me = idOf(actor?._id);
  return Boolean(me && committee && idOf(committee.committeeHeadId) === me);
}

export function isTrackerRosterMember(actor: TrackerActor | null | undefined, committee: TrackerCommittee | null | undefined) {
  const me = idOf(actor?._id);
  if (!me || !committee) return false;
  return (committee.committeeMembers || []).some((m) => idOf(m) === me);
}

/// Admins, E-Council, the head and the roster. Everyone on the roster can edit
/// every task, so "view" and "edit" are the same set.
export function canViewTracker(actor: TrackerActor | null | undefined, committee: TrackerCommittee | null | undefined) {
  if (!actor || !committee) return false;
  return (
    isOfficerActor(actor) ||
    isTrackerHead(actor, committee) ||
    isTrackerRosterMember(actor, committee)
  );
}

/// Delete tasks, manage tags, see the Team view, receive the digest.
export function canManageTracker(actor: TrackerActor | null | undefined, committee: TrackerCommittee | null | undefined) {
  if (!actor || !committee) return false;
  return isOfficerActor(actor) || isTrackerHead(actor, committee);
}

export type TrackerLevel = "view" | "manage";

export function assertTrackerAccess(
  actor: TrackerActor | null | undefined,
  committee: TrackerCommittee | null | undefined,
  level: TrackerLevel = "view"
) {
  if (!canViewTracker(actor, committee)) throw notFound("Not found");
  if (level === "manage" && !canManageTracker(actor, committee)) {
    throw forbidden("Only the committee head can do that");
  }
}

export { isAdminActor };
