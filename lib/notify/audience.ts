// lib/notify/audience.ts
// Who hears about a movement on the chapter ledger.
//
// Three audiences, and they are asymmetric on purpose:
//
//   - The member the money belongs to, who hears when something is done *to*
//     their ledger by somebody else.
//   - The active Treasurer, who owns the finance queue. Their email copy goes
//     to the shared treasury mailbox instead of a personal address.
//   - The broader officer audience, reserved for non-financial chapter alerts
//     such as proxy-vote requests.
import Member from "@/lib/models/Member";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { replyToFor } from "@/lib/notify/from";
import logger from "@/lib/logger";
import type { Recipient } from "@/lib/notify/channels/types";

/// Officer lookups are cached for a beat because a single "assign dues to
/// everyone" click resolves this audience once per member otherwise. Short
/// enough that adding someone to E-Council takes effect within a minute.
const CACHE_TTL_MS = 60_000;
let officerCache: { at: number; recipients: Recipient[] } | null = null;
let treasuryCache: { at: number; recipients: Recipient[] } | null = null;

function toRecipient(member: any): Recipient {
  return {
    memberId: member._id,
    firstName: member.fName ?? "",
    lastName: member.lName ?? "",
    rollNo: member.rollNo ?? "",
    email: member.email ?? null,
  };
}

/// Every sitting E-Council member and admin.
///
/// Alumni and removed members are excluded even if the role flag was never
/// cleared, which happens — a graduated treasurer keeps `isECouncil: true`
/// until somebody remembers to turn it off, and should not still be getting
/// pushes about this year's dues.
export async function officerRecipients(now = Date.now()): Promise<Recipient[]> {
  if (officerCache && now - officerCache.at < CACHE_TTL_MS) {
    return officerCache.recipients;
  }

  const officers = await Member.find({
    status: "Active",
    $or: [
      { isECouncil: true },
      { role: { $in: ["admin", "superadmin"] } },
    ],
  })
    .select("_id rollNo fName lName email clerkId")
    .lean<any[]>();

  // Top up addresses in one batch rather than one Clerk call per officer.
  // Quiet on failure: a stale address is a reason to send to it, not a reason
  // to drop the notification.
  try {
    await ensureMemberEmails(officers.map((officer) => officer._id));
    const fresh = await Member.find({ _id: { $in: officers.map((o) => o._id) } })
      .select("_id rollNo fName lName email")
      .lean<any[]>();
    const emailById = new Map(fresh.map((m) => [String(m._id), m.email ?? null]));
    officers.forEach((officer) => {
      officer.email = emailById.get(String(officer._id)) ?? officer.email ?? null;
    });
  } catch (err: any) {
    logger.warn({ err }, "Could not refresh officer emails — sending with what we have");
  }

  const recipients = officers.map(toRecipient);
  officerCache = { at: now, recipients };
  return recipients;
}

/// The one internal recipient for dues, plans, reimbursements, and credits.
///
/// In-app and push delivery follow the member currently holding the Treasurer
/// position. Email always targets the shared mailbox, so elections and officer
/// turnover never require changing notification code or exposing a personal
/// address as the chapter's financial point of contact.
export async function treasuryRecipients(
  now = Date.now()
): Promise<Recipient[]> {
  if (treasuryCache && now - treasuryCache.at < CACHE_TTL_MS) {
    return treasuryCache.recipients;
  }

  const treasurer = await Member.findOne({
    status: "Active",
    isECouncil: true,
    ecouncilPosition: /^Treasurer$/i,
  })
    .sort({ updatedAt: -1 })
    .select("_id rollNo fName lName")
    .lean<any>();

  const recipients = treasurer
    ? [
        {
          ...toRecipient(treasurer),
          email: replyToFor("dues"),
        },
      ]
    : [];

  if (!treasurer) {
    logger.warn("No active Treasurer found for treasury notifications");
  }

  treasuryCache = { at: now, recipients };
  return recipients;
}

/// Drop the cache. Called when E-Council membership changes so the next send
/// doesn't spend a minute talking to last term's officers.
export function invalidateOfficerCache(): void {
  officerCache = null;
  treasuryCache = null;
}

/// The member a ledger movement is about, as a recipient.
export async function memberRecipient(memberId: any): Promise<Recipient | null> {
  if (!memberId) return null;
  const member = await Member.findById(memberId)
    .select("_id rollNo fName lName email clerkId")
    .lean<any>();
  if (!member) return null;
  if (!member.email && member.clerkId) {
    await ensureMemberEmails([member._id]).catch(() => undefined);
    const refreshed = await Member.findById(memberId).select("email").lean<any>();
    member.email = refreshed?.email ?? null;
  }
  return toRecipient(member);
}

export function displayName(recipient: Recipient | null): string {
  if (!recipient) return "";
  return `${recipient.firstName} ${recipient.lastName}`.trim();
}

/// Just the name, for the actor line on an officer notification.
export async function memberName(memberId: any): Promise<string> {
  if (!memberId) return "";
  const member = await Member.findById(memberId).select("fName lName").lean<any>();
  if (!member) return "";
  return `${member.fName ?? ""} ${member.lName ?? ""}`.trim();
}
