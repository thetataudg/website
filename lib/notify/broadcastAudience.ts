// lib/notify/broadcastAudience.ts
// Who a Notification Center send reaches, as a pure function.
//
// Shared by the compose page and the send route on purpose. The page shows
// "42 people" before the officer presses Send; the route re-resolves the same
// selection on the server rather than trusting a list from the browser. If the
// two used different rules the preview would lie, so there is only one rule.

export const AUDIENCE_GROUPS = [
  { id: "everyone", label: "Everyone", description: "Actives and alumni" },
  { id: "actives", label: "Actives", description: "Active members" },
  { id: "alumni", label: "Alumni", description: "Graduated members" },
  { id: "ecouncil", label: "E-Council", description: "Sitting executive council" },
  { id: "admins", label: "Admins", description: "Website administrators" },
  { id: "committee_heads", label: "Committee heads", description: "Active committee chairs" },
] as const;

export type AudienceGroup = (typeof AUDIENCE_GROUPS)[number]["id"];

export const BROADCAST_CHANNELS = [
  { id: "push", label: "Push", description: "Lock screen notification on the iPhone app" },
  { id: "inapp", label: "In-app", description: "The bell in the app and on the website" },
  { id: "email", label: "Email", description: "Sent to each member's email address" },
] as const;

export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number]["id"];

export interface AudienceSelection {
  groups: string[];
  committeeIds: string[];
  memberIds: string[];
}

/// The fields the rule needs, and nothing else, so the browser can run it on
/// the roster it already has.
export interface AudienceMember {
  _id: string;
  status?: string | null;
  role?: string | null;
  isECouncil?: boolean;
  isCommitteeHead?: boolean;
  /// Every committee this member sits on or chairs.
  committeeIds: string[];
  /// Committees this member chairs.
  headOf: string[];
}

/// Removed and deceased members are never addressable, even by name.
export function isAddressable(member: Pick<AudienceMember, "status">): boolean {
  return member.status === "Active" || member.status === "Alumni";
}

function inGroup(member: AudienceMember, group: string): boolean {
  const active = member.status === "Active";
  switch (group) {
    case "everyone":
      return true;
    case "actives":
      return active;
    case "alumni":
      return member.status === "Alumni";
    case "ecouncil":
      // Active only: a graduated officer keeps `isECouncil` until someone
      // clears it, and should not hear about this year's council business.
      return active && Boolean(member.isECouncil);
    case "admins":
      return member.role === "admin" || member.role === "superadmin";
    case "committee_heads":
      return active && (Boolean(member.isCommitteeHead) || member.headOf.length > 0);
    default:
      return false;
  }
}

/// Union of every group, committee and hand-picked member in the selection.
export function resolveAudience<T extends AudienceMember>(
  members: T[],
  selection: AudienceSelection
): T[] {
  const groups = new Set(selection.groups);
  const committees = new Set(selection.committeeIds);
  const picked = new Set(selection.memberIds);

  return members.filter((member) => {
    if (!isAddressable(member)) return false;
    if (picked.has(member._id)) return true;
    for (const group of Array.from(groups)) {
      if (inGroup(member, group)) return true;
    }
    return member.committeeIds.some((id) => committees.has(id));
  });
}

/// "Alumni, Finance committee and 3 people". Stored on the history row.
export function describeAudience(
  selection: AudienceSelection,
  committeeNames: Record<string, string>
): string {
  const parts: string[] = [];
  for (const group of AUDIENCE_GROUPS) {
    if (selection.groups.includes(group.id)) parts.push(group.label);
  }
  for (const id of selection.committeeIds) {
    const name = committeeNames[id];
    if (name) parts.push(`${name} committee`);
  }
  if (selection.memberIds.length) {
    parts.push(
      selection.memberIds.length === 1
        ? "1 person"
        : `${selection.memberIds.length} people`
    );
  }
  if (parts.length <= 1) return parts[0] ?? "Nobody";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
