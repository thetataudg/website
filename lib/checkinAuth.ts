// Who is allowed to run the door for a given event.
//
// This exact block was copy-pasted in four places — `check-in`,
// `manual-check-in` POST and DELETE, and now the booth routes would have made
// five. It is the one rule that decides whether somebody can write attendance,
// so it lives in one file.
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import { resolveEventAccess } from "@/lib/events/permissions";
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
 * The rule itself lives in `lib/events/permissions.ts`, shared with the event
 * routes, so editing an event and running its door cannot disagree.
 */
export async function canManageCheckIn(actor: any, event: any) {
  return (await resolveEventAccess(actor, event)).canManage;
}

/** Parses a route's `[id]` into an ObjectId, or null if it could never match. */
export function toEventId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}
