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

/// The officers who may actually take a card, and therefore the only people
/// Tap to Pay is worth telling about.
///
/// Mirrors `requireTerminalOperator` exactly: the Treasurer, plus admins who
/// cover for them. Apple asks that the awareness moment reach "all eligible
/// users" (requirement 3.3), and a member who cannot be handed the phone is
/// not eligible for anything. Pushing a merchant announcement at forty
/// undergraduates who can never act on it is noise, not compliance.
///
/// Not cached: this is sent once, and a stale roster on a one-time
/// announcement is worse than the query it saves.
export async function terminalOperatorRecipients(): Promise<Recipient[]> {
  const officers = await Member.find({
    status: "Active",
    $or: [
      { role: { $in: ["admin", "superadmin"] } },
      { isECouncil: true, ecouncilPosition: /treasurer/i },
    ],
  })
    .select("_id rollNo fName lName email clerkId")
    .lean<any[]>();

  try {
    await ensureMemberEmails(officers.map((officer) => officer._id));
    const fresh = await Member.find({ _id: { $in: officers.map((o) => o._id) } })
      .select("_id email")
      .lean<any[]>();
    const emailById = new Map(fresh.map((m) => [String(m._id), m.email ?? null]));
    officers.forEach((officer) => {
      officer.email = emailById.get(String(officer._id)) ?? officer.email ?? null;
    });
  } catch (err: any) {
    logger.warn({ err }, "Could not refresh operator emails — sending with what we have");
  }

  return officers.map(toRecipient);
}

/// Everyone the chapter can address as a body.
///
/// Active members only, and only those with a Clerk account behind them: a
/// placeholder profile created so somebody appears on the roster has no bell
/// to ring and no device to push to, and writing a notification row for one
/// leaves an unread badge nobody can ever clear.
///
/// Not cached. Broadcasts are rare and a stale roster on one is worse than the
/// query it saves.
export async function chapterRecipients(): Promise<Recipient[]> {
  const members = await Member.find({
    status: "Active",
    clerkId: { $nin: [null, ""] },
  })
    .select("_id rollNo fName lName email clerkId")
    .lean<any[]>();

  try {
    await ensureMemberEmails(members.map((member) => member._id));
    const fresh = await Member.find({ _id: { $in: members.map((m) => m._id) } })
      .select("_id email")
      .lean<any[]>();
    const emailById = new Map(fresh.map((m) => [String(m._id), m.email ?? null]));
    members.forEach((member) => {
      member.email = emailById.get(String(member._id)) ?? member.email ?? null;
    });
  } catch (err: any) {
    logger.warn({ err }, "Could not refresh chapter emails, sending with what we have");
  }

  return members.map(toRecipient);
}

/// Everyone who can see one event, as recipients.
///
/// Mirrors the visibility filter in `GET /api/events` exactly, and that is the
/// whole point: actives see every event, alumni see only the ones flagged
/// `visibleToAlumni`. A notification for an event the recipient cannot open is
/// worse than no notification, so the audience is derived from the same rule
/// the list is, rather than a second rule that has to be kept in agreement
/// with it by hand.
///
/// Committee events are deliberately not narrowed to the committee. The events
/// list does not narrow them either, so a committee meeting is already
/// chapter-visible; sending it to the roster tells people something they can
/// act on rather than something they have to go looking for.
///
/// Not cached, for the same reason `chapterRecipients` is not.
export async function eventRecipients(
  visibleToAlumni: boolean
): Promise<Recipient[]> {
  const statuses = visibleToAlumni ? ["Active", "Alumni"] : ["Active"];
  const members = await Member.find({
    status: { $in: statuses },
    clerkId: { $nin: [null, ""] },
  })
    .select("_id rollNo fName lName email clerkId")
    .lean<any[]>();

  try {
    await ensureMemberEmails(members.map((member) => member._id));
    const fresh = await Member.find({ _id: { $in: members.map((m) => m._id) } })
      .select("_id email")
      .lean<any[]>();
    const emailById = new Map(fresh.map((m) => [String(m._id), m.email ?? null]));
    members.forEach((member) => {
      member.email = emailById.get(String(member._id)) ?? member.email ?? null;
    });
  } catch (err: any) {
    logger.warn({ err }, "Could not refresh event emails, sending with what we have");
  }

  return members.map(toRecipient);
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
