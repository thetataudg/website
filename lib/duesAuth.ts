// lib/duesAuth.ts
// Who is allowed to touch the chapter ledger.
//
// Deliberately separate from `lib/dues.ts`: that module is pure serialization
// and is imported anywhere a charge is rendered, so it must not drag a live
// database connection and a Clerk client along with it.
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { holdsOffice } from "@/lib/officeMatch";

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

/// Who may take a card payment on the chapter's Stripe account.
///
/// Deliberately narrower than `requireTreasury`. Reading the ledger is E-Council
/// business, but a Terminal connection token authorizes taking live payments on
/// the chapter's account, and the officer holding the phone is the one whose
/// name is stamped on `operatorId` for every payment they take. That is the
/// Treasurer's job and an admin's cover for it, which is also what the iOS
/// client has always meant by `canManageDues` — so this makes the server agree
/// with the screen instead of quietly admitting more people than the app shows
/// the button to.
export async function requireTerminalOperator(req: Request) {
  const viewer = await requireTreasury(req);
  const privileged =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    holdsOffice(viewer.ecouncilPosition, "treasurer");
  if (!privileged) {
    const err: any = new Error(
      "Only the Treasurer or an admin can take card payments"
    );
    err.statusCode = 403;
    throw err;
  }
  return viewer;
}
