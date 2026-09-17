// lib/mail/filters.ts
// Matching messages against a member's filters, and applying what they say.
import MailFilter from "@/lib/models/MailFilter";
import MailLabel from "@/lib/models/MailLabel";
import MailMessage from "@/lib/models/MailMessage";

export const LABEL_COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;

export interface FilterCriteria {
  from: string;
  to: string;
  subject: string;
  hasWords: string;
  doesNotHave: string;
  hasAttachment: boolean;
}

export interface FilterActions {
  skipInbox: boolean;
  markRead: boolean;
  star: boolean;
  labelId: string | null;
  trash: boolean;
}

/// The parts of a message a filter looks at.
export interface Filterable {
  from?: string;
  fromName?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  snippet?: string;
  attachments?: Array<{ inline?: boolean }>;
}

const clean = (value: any, max = 300) => String(value ?? "").trim().slice(0, max);

export function parseCriteria(raw: any): FilterCriteria {
  return {
    from: clean(raw?.from),
    to: clean(raw?.to),
    subject: clean(raw?.subject),
    hasWords: clean(raw?.hasWords),
    doesNotHave: clean(raw?.doesNotHave),
    hasAttachment: Boolean(raw?.hasAttachment),
  };
}

export function parseActions(raw: any): FilterActions {
  const labelId = clean(raw?.labelId, 24);
  return {
    skipInbox: Boolean(raw?.skipInbox),
    markRead: Boolean(raw?.markRead),
    star: Boolean(raw?.star),
    labelId: /^[a-f0-9]{24}$/i.test(labelId) ? labelId : null,
    trash: Boolean(raw?.trash),
  };
}

export function hasCriteria(c: FilterCriteria): boolean {
  return Boolean(c.from || c.to || c.subject || c.hasWords || c.doesNotHave || c.hasAttachment);
}

export function hasActions(a: FilterActions): boolean {
  return a.skipInbox || a.markRead || a.star || Boolean(a.labelId) || a.trash;
}

/// Words (or "quoted phrases") in a filter field, lowercased.
function terms(value: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value.toLowerCase()))) out.push((match[1] ?? match[2]).trim());
  return out.filter(Boolean);
}

/// Any of the comma- or "OR"-separated alternatives appears in the haystack.
function anyOf(field: string, haystack: string): boolean {
  const options = field
    .toLowerCase()
    .split(/\s*(?:,|\bor\b)\s*/)
    .map((o) => o.trim())
    .filter(Boolean);
  return options.some((option) => haystack.includes(option));
}

export function matchesFilter(message: Filterable, c: FilterCriteria): boolean {
  if (!hasCriteria(c)) return false;
  const from = `${message.from ?? ""} ${message.fromName ?? ""}`.toLowerCase();
  const to = [...(message.to ?? []), ...(message.cc ?? [])].join(" ").toLowerCase();
  const subject = (message.subject ?? "").toLowerCase();
  const body = `${subject} ${message.text || message.snippet || ""}`.toLowerCase();

  if (c.from && !anyOf(c.from, from)) return false;
  if (c.to && !anyOf(c.to, to)) return false;
  if (c.subject && !subject.includes(c.subject.toLowerCase())) return false;
  if (c.hasWords && !terms(c.hasWords).every((t) => body.includes(t))) return false;
  if (c.doesNotHave && terms(c.doesNotHave).some((t) => body.includes(t))) return false;
  if (c.hasAttachment && !(message.attachments ?? []).some((a) => !a.inline)) return false;
  return true;
}

/// What the account's filters do to one incoming message, before it is saved.
export async function actionsForIncoming(accountId: any, message: Filterable) {
  const filters = await MailFilter.find({ accountId }).sort({ createdAt: 1 }).lean<any[]>();
  const result = { folder: "inbox" as "inbox" | "archive" | "trash", read: false, starred: false, labels: [] as string[] };
  if (!filters.length) return result;

  const labelIds = new Set(
    (await MailLabel.find({ accountId }).select("_id").lean<any[]>()).map((l) => String(l._id))
  );
  for (const filter of filters) {
    if (!matchesFilter(message, filter.criteria)) continue;
    const a = filter.actions ?? {};
    if (a.trash) result.folder = "trash";
    else if (a.skipInbox && result.folder === "inbox") result.folder = "archive";
    if (a.markRead) result.read = true;
    if (a.star) result.starred = true;
    if (a.labelId && labelIds.has(String(a.labelId)) && !result.labels.includes(String(a.labelId))) {
      result.labels.push(String(a.labelId));
    }
  }
  return result;
}

/// "Also apply to matching conversations": runs one filter over mail already
/// in the mailbox. Received mail only, and never what is already in trash.
export async function applyFilterToExisting(accountId: any, criteria: FilterCriteria, actions: FilterActions) {
  const candidates = await MailMessage.find({
    accountId,
    direction: "in",
    folder: { $nin: ["trash", "drafts"] },
  })
    .sort({ date: -1 })
    .limit(5000)
    .select("from fromName to cc subject text snippet attachments.inline folder")
    .lean<any[]>();

  const ids = candidates.filter((m) => matchesFilter(m, criteria)).map((m) => m._id);
  if (!ids.length) return 0;

  const set: Record<string, any> = {};
  if (actions.markRead) set.read = true;
  if (actions.star) set.starred = true;
  if (actions.trash) set.folder = "trash";

  const update: Record<string, any> = {};
  if (Object.keys(set).length) update.$set = set;
  if (actions.labelId) update.$addToSet = { labels: actions.labelId };
  if (Object.keys(update).length) await MailMessage.updateMany({ _id: { $in: ids } }, update);
  if (actions.skipInbox && !actions.trash) {
    await MailMessage.updateMany({ _id: { $in: ids }, folder: "inbox" }, { $set: { folder: "archive" } });
  }
  return ids.length;
}

export function toFilter(f: any) {
  return {
    id: String(f._id),
    criteria: parseCriteria(f.criteria),
    actions: parseActions({ ...f.actions, labelId: f.actions?.labelId ? String(f.actions.labelId) : "" }),
  };
}

/// Shared by create and update: the body, checked, or the reason it isn't.
export async function readFilterBody(accountId: any, body: any) {
  const criteria = parseCriteria(body?.criteria);
  const actions = parseActions(body?.actions);
  if (!hasCriteria(criteria)) return { error: "Fill in at least one thing to match on." };
  if (!hasActions(actions)) return { error: "Choose at least one thing for the filter to do." };
  if (actions.labelId && !(await MailLabel.exists({ _id: actions.labelId, accountId }))) {
    return { error: "That label no longer exists." };
  }
  return { criteria, actions };
}
