// lib/duesAuth.ts
// Who is allowed to touch the chapter ledger.
//
// Deliberately separate from `lib/dues.ts`: that module is pure serialization
// and is imported anywhere a charge is rendered, so it must not drag a live
// database connection and a Clerk client along with it.
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";

/// Dues are E-Council business — the treasurer sits on E-Council, and admins
/// cover for them.
///
/// Lives here rather than in each route so that every new treasury endpoint
/// gets the same answer to "who is allowed", and so the caller always comes
/// back with the actor that FinanceEvent needs to stamp.
export async function requireTreasury(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const viewer = await Member.findOne({ clerkId })
    .select("_id rollNo fName lName role isECouncil ecouncilPosition")
    .lean<any>();
  if (!viewer) {
    const err: any = new Error("Profile not found");
    err.statusCode = 404;
    throw err;
  }
  const privileged =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    Boolean(viewer.isECouncil);
  if (!privileged) {
    const err: any = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
  return viewer;
}
