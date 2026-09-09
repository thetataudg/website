// lib/chapterTools.ts
//
// Who is allowed to run a chapter-wide roster tool.
//
// Extracted from `app/api/members/quick-tools/route.ts` so the phone sync can
// share one definition of the answer rather than inventing a second one.

import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";

export type ChapterToolSubmitter = {
  rollNo?: string;
  fName?: string;
  lName?: string;
  ecouncilPosition?: string;
  role?: string;
};

/**
 * Admins as well as the two seats.
 *
 * This used to be superadmin *or* a sitting Regent/Vice Regent, which locked
 * out every other admin — including the Treasurer and Scribe, who the officer
 * election itself promotes to `role: "admin"`. An admin already has the run
 * of the roster through `/api/members/{rollNo}` and could do all of these by
 * hand, one member at a time; refusing them the tool that does it in one pass
 * protected nothing and just made the job longer.
 *
 * Throws an `Error & { statusCode: 403 }` the routes turn into a response.
 */
export async function requireChapterToolSubmitter(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();

  const submitter = await Member.findOne({
    clerkId,
    $or: [
      { role: { $in: ["superadmin", "admin"] } },
      { isECouncil: true, ecouncilPosition: { $in: ["Regent", "Vice Regent"] } },
    ],
  }).lean<ChapterToolSubmitter>();

  if (!submitter) {
    const error = new Error(
      "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
    ) as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }

  return { clerkId, submitter };
}
