// lib/committeeMembership.ts
// Committees are for actives. The moment a member stops being one — graduated
// to Alumni, Removed, Deceased — they come off every roster and every head
// slot they held.
//
// This is enforced two ways: on the status change itself (`detachMember`), and
// lazily on read (`pruneInactiveCommitteeMembers`) so a member who slipped
// through before this existed disappears the next time anyone opens the
// directory, without a migration.
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

/// Pull one member off every committee: out of the rosters, and out of the
/// head slot wherever they held it. Also clears their `isCommitteeHead` flag,
/// since by definition they no longer head anything.
export async function detachMemberFromCommittees(memberId: any): Promise<void> {
  if (!memberId) return;
  const id = String(memberId);

  const [rosterResult, headResult] = await Promise.all([
    Committee.updateMany(
      { committeeMembers: id },
      { $pull: { committeeMembers: id } }
    ),
    Committee.updateMany(
      { committeeHeadId: id },
      { $set: { committeeHeadId: null } }
    ),
  ]);

  await Member.updateOne({ _id: id }, { $set: { isCommitteeHead: false } });

  if (rosterResult.modifiedCount || headResult.modifiedCount) {
    logger.info(
      {
        memberId: id,
        rosters: rosterResult.modifiedCount,
        headOf: headResult.modifiedCount,
      },
      "Detached non-active member from committees"
    );
  }
}

/// Sweep every committee for members (or heads) whose status is no longer
/// Active and detach them. Scales with the number of people on committees, not
/// the number of alumni. A no-op once everything is clean.
export async function pruneInactiveCommitteeMembers(): Promise<{
  removed: number;
}> {
  const committees = await Committee.find({
    $or: [
      { committeeMembers: { $exists: true, $ne: [] } },
      { committeeHeadId: { $ne: null } },
    ],
  })
    .select("committeeMembers committeeHeadId")
    .lean<any[]>();

  const referenced = new Set<string>();
  for (const c of committees) {
    (c.committeeMembers || []).forEach((m: any) => referenced.add(String(m)));
    if (c.committeeHeadId) referenced.add(String(c.committeeHeadId));
  }
  if (!referenced.size) return { removed: 0 };

  const inactive = await Member.find({
    _id: { $in: [...referenced] },
    status: { $ne: "Active" },
  })
    .select("_id")
    .lean<any[]>();
  if (!inactive.length) return { removed: 0 };

  for (const member of inactive) {
    await detachMemberFromCommittees(member._id);
  }
  return { removed: inactive.length };
}
