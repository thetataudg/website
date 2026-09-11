// lib/googleGroups.ts
// Keeps the chapter Google Groups in step with member status on the site.
//
//   actives@     every Active member, by sign-in email
//   alumni@      every Alumni member, by sign-in email
//   newsletter@  exactly actives@ + alumni@ (the groups themselves)
//   minutes@     exactly actives@ + alumni@
//
// Actives and alumni only ever touch addresses the site knows. An alumnus who
// never made an account stays in alumni@ untouched; one whose status changes
// on the site moves. Owners, managers, our own sending address and anything
// in GROUPS_SYNC_KEEP are never removed from any group.
//
// Signs in as the calendar service account with domain-wide delegation,
// impersonating GOOGLE_GROUPS_ADMIN_EMAIL (a Workspace admin). Until both are
// set up this does nothing.
import { google, admin_directory_v1 } from "googleapis";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { loadServiceAccount } from "@/lib/calendar";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { groupAddress, type ChapterGroup } from "@/lib/notify/groupEmail";
import { alertsDomain } from "@/lib/notify/from";

const SCOPES = ["https://www.googleapis.com/auth/admin.directory.group.member"];
const GROUPS: ChapterGroup[] = ["actives", "alumni", "newsletter", "minutes"];

/// Automatic runs (nightly, after a status change) only happen once this is
/// on. The manual admin run works regardless, so the first big reshuffle is
/// always one somebody looked at.
export function groupSyncEnabled(): boolean {
  return process.env.GROUPS_SYNC_ENABLED === "1";
}

let cachedClient: admin_directory_v1.Admin | null = null;

async function directory(): Promise<admin_directory_v1.Admin | null> {
  if (cachedClient) return cachedClient;
  const subject = process.env.GOOGLE_GROUPS_ADMIN_EMAIL?.trim();
  const credentials = await loadServiceAccount();
  if (!subject || !credentials?.client_email || !credentials?.private_key) {
    logger.warn("Google Groups sync is not configured");
    return null;
  }
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
    subject,
  });
  cachedClient = google.admin({ version: "directory_v1", auth });
  return cachedClient;
}

const norm = (value: unknown) => String(value || "").trim().toLowerCase();

/// The address our emails to this group come from. It has to be a member to
/// be allowed to post, and it can't receive, so it's added with no delivery.
function senderFor(group: ChapterGroup): string {
  const local = group === "actives" || group === "alumni" ? "events" : "chapter";
  return `${local}@${alertsDomain()}`;
}

function keepList(): Set<string> {
  return new Set(
    (process.env.GROUPS_SYNC_KEEP || "").split(",").map(norm).filter(Boolean)
  );
}

/// Chapter mailboxes (regent@, treasurer@, scribe@ and the rest) are officer
/// seats, not people, so no member status puts them in actives@ or alumni@.
/// Whoever added one to a group meant it, and the sync leaves it there.
function isChapterMailbox(email: string): boolean {
  const domain = (process.env.CHAPTER_EMAIL_DOMAIN || "ttdg.org").trim().toLowerCase();
  const groups = GROUPS.map((group) => norm(groupAddress(group)));
  return email.endsWith(`@${domain}`) && !groups.includes(email);
}

interface GroupMember {
  email: string;
  role: string;
}

async function listMembers(
  client: admin_directory_v1.Admin,
  groupKey: string
): Promise<GroupMember[]> {
  const members: GroupMember[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.members.list({ groupKey, maxResults: 200, pageToken });
    for (const member of res.data.members ?? []) {
      if (member.email) members.push({ email: norm(member.email), role: member.role || "MEMBER" });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return members;
}

interface SiteRoster {
  active: Set<string>;
  alumni: Set<string>;
  /// Every address the site has for anybody, whatever their status. Only
  /// these are ever removed from actives@ and alumni@.
  known: Set<string>;
}

async function siteRoster(): Promise<SiteRoster> {
  const withAccounts = await Member.find({
    status: { $in: ["Active", "Alumni"] },
    clerkId: { $type: "string" },
  })
    .select("_id")
    .lean<any[]>();
  await ensureMemberEmails(withAccounts.map((member) => member._id)).catch(() => undefined);

  const members = await Member.find({ email: { $type: "string" } })
    .select("status email")
    .lean<any[]>();
  const roster: SiteRoster = { active: new Set(), alumni: new Set(), known: new Set() };
  for (const member of members) {
    const email = norm(member.email);
    if (!email) continue;
    roster.known.add(email);
    if (member.status === "Active") roster.active.add(email);
    if (member.status === "Alumni") roster.alumni.add(email);
  }
  return roster;
}

export interface GroupPlan {
  group: ChapterGroup;
  address: string;
  currentCount: number;
  add: string[];
  remove: string[];
  errors: string[];
}

function planFor(group: ChapterGroup, current: GroupMember[], roster: SiteRoster): GroupPlan {
  const sender = senderFor(group);
  const protectedEmails = new Set<string>([
    sender,
    ...keepList(),
    ...current.filter((member) => member.role !== "MEMBER").map((member) => member.email),
  ]);

  let desired: Set<string>;
  let removable: (email: string) => boolean;
  if (group === "actives" || group === "alumni") {
    desired = new Set(group === "actives" ? roster.active : roster.alumni);
    removable = (email) => roster.known.has(email);
  } else {
    desired = new Set([norm(groupAddress("actives")), norm(groupAddress("alumni"))]);
    removable = () => true;
  }
  desired.add(sender);

  const currentEmails = new Set(current.map((member) => member.email));
  return {
    group,
    address: groupAddress(group),
    currentCount: current.length,
    add: Array.from(desired).filter((email) => !currentEmails.has(email)).sort(),
    remove: current
      .map((member) => member.email)
      .filter(
        (email) =>
          !desired.has(email) &&
          !protectedEmails.has(email) &&
          !isChapterMailbox(email) &&
          removable(email)
      )
      .sort(),
    errors: [],
  };
}

/// A removal this big on an automatic run is more likely a bug or a bad
/// status import than real news, so it waits for a person to run it.
function looksLikeMassRemoval(plan: GroupPlan): boolean {
  return plan.remove.length > 25 && plan.remove.length > plan.currentCount * 0.2;
}

function statusOf(err: any): number {
  return Number(err?.code || err?.response?.status || 0);
}

export interface SyncOptions {
  /// False works out the changes without making any.
  apply: boolean;
  /// Lets a manual run make a large removal the automatic runs refuse.
  allowMassRemoval?: boolean;
}

export async function syncChapterGroups(options: SyncOptions): Promise<GroupPlan[] | null> {
  const client = await directory();
  if (!client) return null;
  const roster = await siteRoster();
  const plans: GroupPlan[] = [];

  for (const group of GROUPS) {
    const groupKey = groupAddress(group);
    let plan: GroupPlan;
    try {
      plan = planFor(group, await listMembers(client, groupKey), roster);
    } catch (err: any) {
      logger.warn({ err, group }, "Could not read Google Group members");
      plans.push({ group, address: groupKey, currentCount: 0, add: [], remove: [], errors: [String(err?.message || err)] });
      continue;
    }

    if (options.apply) {
      const sender = senderFor(group);
      for (const email of plan.add) {
        try {
          await client.members.insert({
            groupKey,
            requestBody: {
              email,
              role: "MEMBER",
              ...(email === sender ? { delivery_settings: "NONE" } : {}),
            },
          });
        } catch (err: any) {
          if (statusOf(err) !== 409) plan.errors.push(`add ${email}: ${err?.message || err}`);
        }
      }

      if (!options.allowMassRemoval && looksLikeMassRemoval(plan)) {
        plan.errors.push(
          `Skipped ${plan.remove.length} removals: too many for an automatic run. Run it from the admin sync.`
        );
      } else {
        for (const email of plan.remove) {
          try {
            await client.members.delete({ groupKey, memberKey: email });
          } catch (err: any) {
            if (statusOf(err) !== 404) plan.errors.push(`remove ${email}: ${err?.message || err}`);
          }
        }
      }
    }
    plans.push(plan);
  }

  logger.info(
    {
      apply: options.apply,
      groups: plans.map((plan) => ({
        group: plan.group,
        add: plan.add.length,
        remove: plan.remove.length,
        errors: plan.errors.length,
      })),
    },
    "Google Groups sync"
  );
  return plans;
}

/// For the routes that change someone's status. Never throws, and does
/// nothing until automatic sync is switched on.
export async function syncGroupsAfterStatusChange(reason: string): Promise<void> {
  if (!groupSyncEnabled()) return;
  try {
    await syncChapterGroups({ apply: true });
  } catch (err: any) {
    logger.warn({ err, reason }, "Google Groups sync after status change failed");
  }
}
