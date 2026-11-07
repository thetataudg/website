// lib/rush/permissions.ts
// Who may edit the public /rush page: admins, E-Council, and the head of the
// committee switched on as the rush committee. Never matched by name.
import { isOfficerActor } from "@/lib/events/permissions";
import { getRushCommittee } from "@/lib/committeeQueries";

export interface RushActor {
  _id?: any;
  role?: string | null;
  isECouncil?: boolean | null;
}

/// The pure rule, given the rush committee (or null when none is set).
export function canEditRushPageWith(
  actor: RushActor | null | undefined,
  rushCommittee: { committeeHeadId?: any } | null | undefined
): boolean {
  if (!actor) return false;
  if (isOfficerActor(actor)) return true;
  const me = actor._id ? String(actor._id) : "";
  const head = rushCommittee?.committeeHeadId
    ? String(rushCommittee.committeeHeadId?._id ?? rushCommittee.committeeHeadId)
    : "";
  return Boolean(me && head && me === head);
}

export async function canEditRushPage(actor: RushActor | null | undefined) {
  if (!actor) return false;
  if (isOfficerActor(actor)) return true;
  return canEditRushPageWith(actor, await getRushCommittee());
}
