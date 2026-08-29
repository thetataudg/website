// lib/newsletterAuth.ts
// Who may write the chapter's newsletters, and who may see a draft.
//
// Separate from `lib/newsletters.ts` for the reason `duesAuth` is separate
// from `dues`: that module is pure vocabulary and gets imported by anything
// that renders an article, including the public page, so it must not drag a
// live database connection and a Clerk client along with it.
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";

export interface NewsletterActor {
  _id: any;
  rollNo?: string;
  fName?: string;
  lName?: string;
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
}

/// Anyone with a seat at the table.
///
/// E-Council as a whole rather than the Corresponding Secretary alone. The
/// newsletter is theirs to write, but an election, a resignation or a term
/// where nobody fills the seat should not leave the chapter unable to publish,
/// and every one of those has happened. Admins cover for all of them.
export function canEditNewsletters(member: NewsletterActor | null): boolean {
  if (!member) return false;
  return (
    member.role === "admin" ||
    member.role === "superadmin" ||
    Boolean(member.isECouncil)
  );
}

/// The signed-in member, or null. Never throws.
///
/// Reads are public, so "nobody is signed in" is an ordinary answer here
/// rather than a failure. It is what separates a visitor from an officer who
/// should also see the drafts.
export async function optionalViewer(): Promise<NewsletterActor | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    await connectDB();
    return await Member.findOne({ clerkId: userId })
      .select("_id rollNo fName lName role isECouncil ecouncilPosition")
      .lean<NewsletterActor>();
  } catch {
    return null;
  }
}

/// The signed-in member, refused unless they can publish.
///
/// Throws with a `statusCode` the route turns into a response, matching
/// `requireTreasury`.
export async function requireNewsletterEditor(): Promise<NewsletterActor> {
  const { userId } = await auth();
  if (!userId) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  await connectDB();
  const viewer = await Member.findOne({ clerkId: userId })
    .select("_id rollNo fName lName role isECouncil ecouncilPosition")
    .lean<NewsletterActor>();
  if (!viewer) {
    const err: any = new Error("Profile not found");
    err.statusCode = 404;
    throw err;
  }
  if (!canEditNewsletters(viewer)) {
    const err: any = new Error(
      "Only E-Council or an admin can write chapter newsletters."
    );
    err.statusCode = 403;
    throw err;
  }
  return viewer;
}
