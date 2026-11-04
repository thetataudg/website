// lib/mcp/resolve.ts
// Turning what a person (or a model) says into ids: "Jane Doe", "1234",
// "Philanthropy", an ObjectId. The tools accept all of them so an agent does
// not have to look an id up before every call.
import mongoose from "mongoose";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import { ToolError } from "@/lib/mcp/tool";

export function isObjectId(value: string) {
  return /^[a-fA-F0-9]{24}$/.test(value) && mongoose.Types.ObjectId.isValid(value);
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MEMBER_FIELDS = "_id rollNo fName lName status";

export type MemberMatch =
  | { ok: true; member: any }
  | { ok: false; reason: string };

/// An ObjectId, a roll number, or a full name. Names that match more than one
/// member are refused with the candidates listed rather than guessed at.
export async function resolveMember(ref: string): Promise<MemberMatch> {
  const text = String(ref ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };

  if (isObjectId(text)) {
    const byId = await Member.findById(text).select(MEMBER_FIELDS).lean<any>();
    return byId ? { ok: true, member: byId } : { ok: false, reason: "no member with that id" };
  }

  const byRoll = await Member.findOne({ rollNo: text }).select(MEMBER_FIELDS).lean<any>();
  if (byRoll) return { ok: true, member: byRoll };

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    const matches = await Member.find({
      fName: new RegExp(`^${escapeRegExp(first)}$`, "i"),
      lName: new RegExp(`^${escapeRegExp(last)}$`, "i"),
    })
      .select(MEMBER_FIELDS)
      .limit(5)
      .lean<any[]>();
    if (matches.length === 1) return { ok: true, member: matches[0] };
    if (matches.length > 1) {
      return {
        ok: false,
        reason: `ambiguous, use a roll number: ${matches
          .map((m) => `${m.fName} ${m.lName} (${m.rollNo})`)
          .join(", ")}`,
      };
    }
  }
  return { ok: false, reason: "no member matches" };
}

export async function requireMember(ref: string) {
  const match = await resolveMember(ref);
  if (!match.ok) throw new ToolError(`Could not find member "${ref}": ${match.reason}.`);
  return match.member;
}

/// An ObjectId or a committee name (case-insensitive, exact).
export async function resolveCommittee(ref: string) {
  const text = String(ref ?? "").trim();
  if (!text) return null;
  if (isObjectId(text)) return Committee.findById(text).lean<any>();
  return Committee.findOne({ name: new RegExp(`^${escapeRegExp(text)}$`, "i") }).lean<any>();
}

export async function requireCommittee(ref: string) {
  const committee = await resolveCommittee(ref);
  if (!committee) throw new ToolError(`Could not find a committee "${ref}". Use list_committees.`);
  return committee;
}

export function fullName(member: any) {
  return `${member?.fName ?? ""} ${member?.lName ?? ""}`.trim();
}
