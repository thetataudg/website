// lib/bugs/permissions.ts
// Who may file and who may see a bug report. Pure, so the checks run it.

const str = (v: unknown) => (v == null ? "" : String((v as any)?._id ?? v));

/// Any signed-in member, active or alumni. Removed and Deceased are refused.
export function canReport(actor: { _id?: unknown; status?: string | null } | null | undefined): boolean {
  if (!actor?._id) return false;
  return actor.status !== "Removed" && actor.status !== "Deceased";
}

/// The reporter, a subscriber, or the tech committee (`isStaff`).
export function canSeeBug(
  actor: { _id?: unknown } | null | undefined,
  bug: { reporterMemberId?: unknown; subscriberMemberIds?: unknown[] },
  isStaff: boolean
): boolean {
  if (!actor?._id) return false;
  if (isStaff) return true;
  const me = str(actor._id);
  if (str(bug.reporterMemberId) === me) return true;
  return (bug.subscriberMemberIds || []).some((id) => str(id) === me);
}

/// Screenshots are stored under the uploader's own prefix, so a key proves
/// who uploaded it and nobody can attach someone else's picture.
export function screenshotPrefixFor(actor: { _id?: unknown }): string {
  return `bugs/${str(actor._id)}`;
}
