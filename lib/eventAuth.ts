// lib/eventAuth.ts
// Who is allowed to put something on a committee's or the chapter's calendar.
//
// This block was written inline in `app/api/events/route.ts`. The availability
// poll routes need exactly the same rule — a poll becomes an `Event`, so the
// permission to create the poll has to be the permission to create the event —
// and two copies of an authorization check is one place for them to drift.
//
// The rule: admins and E-Council can touch anything. A committee's own head or
// a member of its roster can touch that committee's calendar. Everyone else is
// forbidden.
import Committee from "@/lib/models/Committee";

export interface EventScopeMember {
  _id: any;
  role?: string | null;
  isECouncil?: boolean | null;
}

export type EventScopeCheck =
  | { ok: true; committee: any | null; isChapterWide: boolean }
  | { ok: false; status: 403 | 404; error: string };

/// Can `member` create/manage an event (or availability poll) scoped to
/// `committeeId`? Pass a falsy `committeeId` for the chapter-wide scope.
///
/// Returns a result rather than throwing so the API routes can map it straight
/// to a `NextResponse` status without a try/catch around every call.
export async function checkEventScopeAccess(
  member: EventScopeMember,
  committeeId?: string | null
): Promise<EventScopeCheck> {
  const isAdmin = member.role === "admin" || member.role === "superadmin";
  const isECouncil = !!member.isECouncil;
  const isChapterWide = !committeeId;

  if (isChapterWide) {
    if (isAdmin || isECouncil) {
      return { ok: true, committee: null, isChapterWide: true };
    }
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const committee = await Committee.findById(committeeId);
  if (!committee) {
    return { ok: false, status: 404, error: "Committee not found" };
  }

  const me = member._id?.toString();
  const headId = committee.committeeHeadId?.toString();
  const memberIds = (committee.committeeMembers || []).map((id: any) =>
    id.toString()
  );
  const isHeadOrMember = headId === me || memberIds.includes(me);

  if (isAdmin || isECouncil || isHeadOrMember) {
    return { ok: true, committee, isChapterWide: false };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}

/// A stricter variant for writes that only a *manager* should do — closing a
/// poll, scheduling the event, editing the reminder policy. A plain committee
/// member can paint their own availability but must not run the poll.
export function isEventScopeManager(
  member: EventScopeMember,
  committee: any | null
): boolean {
  const isAdmin = member.role === "admin" || member.role === "superadmin";
  if (isAdmin || member.isECouncil) return true;
  if (!committee) return false;
  return committee.committeeHeadId?.toString() === member._id?.toString();
}
