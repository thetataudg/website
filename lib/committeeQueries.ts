// lib/committeeQueries.ts
// Reading committees the way the directory does.
//
// This was the body of `GET /api/committees`. The MCP server lists and opens
// committees too, and it has to get the same self-healing (colour backfill,
// ex-actives pruned off rosters) rather than a raw `find` that shows the stale
// rows the website has already cleaned up.
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";
import { nextCalendarColor } from "@/lib/calendarColors";
import { pruneInactiveCommitteeMembers } from "@/lib/committeeMembership";

/**
 * Gives a colour to any committee created before committees had colours.
 *
 * Runs on read because that is the only route every client hits, and it is a
 * no-op the moment there is nothing left to fix. Without it the app would have
 * to invent a colour locally, and the website and the phone would disagree
 * about which committee is teal.
 */
async function backfillColors() {
  const uncoloured = await Committee.find({
    $or: [{ color: { $exists: false } }, { color: null }],
  })
    .select("_id")
    .lean<any[]>();
  if (!uncoloured.length) return;

  const taken = (
    await Committee.find({ color: { $nin: [null] } })
      .select("color")
      .lean<any[]>()
  ).map((committee) => committee.color);

  for (const committee of uncoloured) {
    const color = nextCalendarColor(taken);
    taken.push(color);
    await Committee.updateOne({ _id: committee._id }, { $set: { color } });
  }
  logger.info({ count: uncoloured.length }, "Backfilled committee calendar colours");
}

/// Committees matching `filter`, with head and roster populated to name and
/// roll number.
export async function listCommittees(filter: Record<string, unknown> = {}) {
  await backfillColors();
  // Self-healing: anyone who has since gone Alumni/Removed/Deceased comes off
  // the rosters here, so a stale entry disappears the next time the directory
  // is opened rather than needing a migration.
  await pruneInactiveCommitteeMembers();

  return Committee.find(filter)
    .populate("committeeHeadId", "fName lName rollNo")
    .populate("committeeMembers", "fName lName rollNo")
    .lean();
}

/// One committee with head, roster and a summary of its events, or null.
export async function loadCommittee(id: string) {
  await pruneInactiveCommitteeMembers();
  return Committee.findById(id)
    .populate("committeeHeadId", "fName lName rollNo")
    .populate("committeeMembers", "fName lName rollNo")
    .populate("events", "name startTime endTime status")
    .lean();
}

/// The committee flagged `isTechCommittee`, or null. Never matched by name.
export async function getTechCommittee() {
  return Committee.findOne({ isTechCommittee: true }).lean<any>();
}

/// The committee flagged `isRushCommittee`, or null. Never matched by name.
export async function getRushCommittee() {
  return Committee.findOne({ isRushCommittee: true }).lean<any>();
}

export type CommitteeFlag = "isTechCommittee" | "isRushCommittee";

/// Turns `flag` on for one committee and off everywhere else, so at most one
/// committee ever holds it.
export async function claimCommitteeFlag(committeeId: unknown, flag: CommitteeFlag) {
  await Committee.updateMany(
    { _id: { $ne: committeeId }, [flag]: true },
    { $set: { [flag]: false } }
  );
}
