// lib/discordLink.ts
// The one fact the Discord link routes have to agree on.
//
// Both the route that mints the OAuth state and the callback that consumes it
// decide where the browser is allowed to land afterwards. That value is
// round-tripped through Discord and echoed into a redirect, so if the two
// disagree the app's callback silently becomes /member and the authentication
// session in the app never closes. A shared constant rather than a literal in
// each file, and a fixed string rather than a pattern, because "any URL that
// looks like our app" is how open redirects get written.
export const APP_LINK_CALLBACK = "org.thetatau.dg.ThetaTau://discord-linked";

/// Where the callback may send the browser: site-relative paths, plus the iOS
/// app's own scheme. Anything else collapses to the member home.
export function normalizeDiscordRedirect(value: string | null | undefined) {
  if (!value) return "/member";
  if (value === APP_LINK_CALLBACK) return value;
  if (value.startsWith("/")) return value;
  return "/member";
}

/// The profile a Discord link should attach to, whether or not the person has
/// been approved yet.
///
/// Onboarding asks for Discord before an officer has reviewed anything, so at
/// that point there is no `Member` row — only a `PendingMember`. Both routes
/// used to look in `Member` alone and answer "Member record missing", which
/// made the one place that *requires* the link the one place it could never
/// work. `PendingMember.discordId` already exists and approval copies it
/// across, so the pending row is a real destination, not a holding pen.
export type DiscordLinkTarget = {
  kind: "member" | "pending";
  id: string;
};

/// Why a lookup found nothing to link to. `rejected` is separated from `none`
/// because the two want different answers: one is "you haven't filled this in
/// yet", the other is "you did, and it was declined". Telling a declined
/// applicant to finish their profile would send them round a loop they cannot
/// leave.
export type DiscordLinkRefusal = "none" | "rejected";

export type DiscordLinkLookup =
  | { ok: true; target: DiscordLinkTarget }
  | { ok: false; reason: DiscordLinkRefusal };

/// Only a request that is still open may be linked.
///
/// Approval deletes the pending row, so in practice the status seen here is
/// `pending` or `rejected` — but anything that is not `pending` is refused,
/// which keeps a stray `approved` row from being writable too.
const LINKABLE_PENDING_STATUS = "pending";

/// Looks up `clerkId` in `Member` first: someone who has both rows is an
/// approved member whose pending row has not been cleaned up, and the approved
/// profile is the one the rest of the app reads. An approved member is never
/// blocked by the status of a leftover request.
export async function findDiscordLinkTarget(
  clerkId: string,
  models: { Member: any; PendingMember: any }
): Promise<DiscordLinkLookup> {
  const member = await models.Member.findOne({ clerkId }).select("_id").lean();
  if (member) return { ok: true, target: { kind: "member", id: String(member._id) } };

  const pending = await models.PendingMember.findOne({ clerkId })
    .select("_id status")
    .lean();
  if (!pending) return { ok: false, reason: "none" };
  if (pending.status !== LINKABLE_PENDING_STATUS) {
    return { ok: false, reason: "rejected" };
  }

  return { ok: true, target: { kind: "pending", id: String(pending._id) } };
}

/// The filter the callback updates a pending row through.
///
/// The same status rule as above, applied at write time rather than read time:
/// a request can be declined in the minutes between starting the Discord
/// handshake and coming back from it, and the decision should win.
export function pendingLinkFilter(clerkId: string) {
  return { clerkId, status: LINKABLE_PENDING_STATUS };
}

/// Whether some *other* account already claims this Discord ID.
///
/// Checked across both collections. `PendingMember.discordId` carries a sparse
/// unique index and `Member` is the roster, so a duplicate that slipped past
/// this check would surface later as a write error at approval time, which is
/// the worst possible moment to discover it.
export async function discordIdTakenByAnother(
  discordId: string,
  clerkId: string,
  models: { Member: any; PendingMember: any }
): Promise<boolean> {
  const query = { discordId, clerkId: { $ne: clerkId } };
  const [member, pending] = await Promise.all([
    models.Member.findOne(query).select("_id").lean(),
    models.PendingMember.findOne(query).select("_id").lean(),
  ]);
  return Boolean(member || pending);
}
