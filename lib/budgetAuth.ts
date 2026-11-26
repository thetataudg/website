// lib/budgetAuth.ts
// Who may see and change committee budget data.
//
//   - Treasury (E-Council + admins, the same rule as dues) sees and does
//     everything except file a committee's own proposal or requests.
//   - A committee's current head sees that committee and files for it.
//
// "Current head" is read from the committee on every request, so a head
// change takes effect immediately and the old head loses access.
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Committee from "@/lib/models/Committee";
import { canManageDues } from "@/lib/duesAuth";
import { getDefaultSemesterRange, parseSemesterName } from "@/lib/gem";

export class BudgetHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface BudgetViewer {
  _id: any;
  rollNo: string;
  fName: string;
  lName: string;
  isTreasury: boolean;
}

export async function budgetViewer(req: Request): Promise<BudgetViewer> {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId })
    .select("_id rollNo fName lName role isECouncil status")
    .lean<any>();
  if (!member) throw new BudgetHttpError(404, "Profile not found");
  return {
    _id: member._id,
    rollNo: member.rollNo ?? "",
    fName: member.fName ?? "",
    lName: member.lName ?? "",
    isTreasury: canManageDues(member),
  };
}

export function requireTreasuryViewer(viewer: BudgetViewer) {
  if (!viewer.isTreasury) throw new BudgetHttpError(403, "Only the treasury can do that");
}

export function isObjectId(value: any): boolean {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
}

export interface CommitteeAccess {
  committee: any;
  isHead: boolean;
  isTreasury: boolean;
}

/// Loads a committee and what the viewer may do with it. Throws 403 when
/// they may do nothing.
export async function committeeAccess(
  viewer: BudgetViewer,
  committeeId: any
): Promise<CommitteeAccess> {
  if (!isObjectId(committeeId)) throw new BudgetHttpError(400, "Invalid committee");
  const committee = await Committee.findById(committeeId)
    .select("_id name color committeeHeadId")
    .lean<any>();
  if (!committee) throw new BudgetHttpError(404, "Committee not found");
  const isHead =
    Boolean(committee.committeeHeadId) &&
    String(committee.committeeHeadId) === String(viewer._id);
  if (!isHead && !viewer.isTreasury) {
    throw new BudgetHttpError(403, "Only this committee's head and the treasury can see its budget");
  }
  return { committee, isHead, isTreasury: viewer.isTreasury };
}

/// Committees the viewer heads.
export async function headedCommitteeIds(viewer: BudgetViewer): Promise<string[]> {
  const rows = await Committee.find({ committeeHeadId: viewer._id }).select("_id").lean<any[]>();
  return rows.map((r) => String(r._id));
}

/// A term name from a query string or body, normalized to "Fall 2026".
/// Defaults to the current semester.
export function readTerm(raw: any): string {
  const value = String(raw ?? "").trim();
  if (!value) return getDefaultSemesterRange().name;
  const parsed = parseSemesterName(value);
  if (!parsed) throw new BudgetHttpError(400, "Term must look like \"Fall 2026\" or \"Spring 2027\"");
  return parsed.name;
}

/// The term after this one: Fall 2026 -> Spring 2027 -> Fall 2027.
export function nextTerm(term: string): string {
  const parsed = parseSemesterName(term);
  if (!parsed) return term;
  const [season, yearRaw] = parsed.name.split(" ");
  const year = Number(yearRaw);
  return season === "Fall" ? `Spring ${year + 1}` : `Fall ${year}`;
}
