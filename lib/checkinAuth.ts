// Who is allowed to run the door for a given event.
//
// This exact block was copy-pasted in four places — `check-in`,
// `manual-check-in` POST and DELETE, and now the booth routes would have made
// five. It is the one rule that decides whether somebody can write attendance,
// so it lives in one file.
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";

/** The signed-in member behind a request, or a throw. */
export async function getMemberByClerk(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean<any>();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return member;
}

/**
 * True for admins, E-Council, and the head of the committee the event belongs
 * to.
 *
 * Committee-head truth is `Committee.committeeHeadId` rather than the
 * `isCommitteeHead` boolean on Member — the boolean has drifted from reality
 * and is not trusted anywhere that grants permission.
 */
export async function canManageCheckIn(actor: any, event: any) {
  const isAdmin = actor.role === "admin" || actor.role === "superadmin";
  if (isAdmin || actor.isECouncil) return true;

  if (!event?.committeeId) return false;
  const committee = await Committee.findById(event.committeeId);
  return committee?.committeeHeadId?.toString() === actor._id?.toString();
}

/** Parses a route's `[id]` into an ObjectId, or null if it could never match. */
export function toEventId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}
