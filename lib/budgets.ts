// lib/budgets.ts
// Committee budget arithmetic. Pure: no database, no Clerk, no logger, so the
// check script can run it directly and any route or page can import it.
//
// Nothing on a budget stores a balance. Every number here is derived from two
// sources at read time:
//
//   BudgetEntry      allocations, adjustments, income, direct spend,
//                    transfers, rollovers, reversals
//   Reimbursement    committee claims and pre-approvals
//
//   funded    = allocations + adjustments + income + transfers in - transfers out
//   spent     = approved claims + direct spend
//   held      = approved pre-approvals, less what claims against them used
//   pending   = pending claims + pending pre-approvals   (shown, never subtracted)
//   available = funded - spent - held

/** Key for a line. `""` is the implicit Unassigned line. */
export const UNASSIGNED = "";

export type LineKey = string;

export function lineKey(lineId: any): LineKey {
  if (lineId === null || lineId === undefined || lineId === "") return UNASSIGNED;
  return String(lineId);
}

function idOf(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value?._id ?? value);
}

/// `$250`, `$83.34`. Same output as `formatCents` in lib/financeEvents, kept
/// local so this module stays free of database imports.
function dollars(value: number): string {
  const abs = Math.abs(Math.round(value));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = abs % 100;
  const sign = value < 0 ? "-" : "";
  return rem ? `${sign}$${whole}.${String(rem).padStart(2, "0")}` : `${sign}$${whole}`;
}

function cents(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// ---------------------------------------------------------------------------
// Ledger shapes (only the fields the math reads)

export interface EntrySide {
  budgetId?: any;
  lineId?: any;
}

export interface EntryLike {
  _id?: any;
  kind: string;
  budgetId?: any;
  lineId?: any;
  from?: EntrySide | null;
  to?: EntrySide | null;
  amountCents: number;
  reversesEntryId?: any;
}

export interface RequestLike {
  _id?: any;
  kind?: string; // "claim" | "preapproval"
  budgetId?: any;
  lineId?: any;
  status: string;
  amountCents: number;
  approvedCents?: number | null;
  preapprovalId?: any;
}

export interface Totals {
  fundedCents: number;
  spentCents: number;
  heldCents: number;
  pendingCents: number;
  availableCents: number;
}

export interface BudgetTotals extends Totals {
  lines: Record<LineKey, Totals>;
}

function emptyTotals(): Totals {
  return { fundedCents: 0, spentCents: 0, heldCents: 0, pendingCents: 0, availableCents: 0 };
}

/// Ids of entries that no longer count: every reversal, and everything a
/// reversal points at. A reversed entry and its reversal cancel out, so the
/// simplest correct thing is to skip both.
export function cancelledEntryIds(entries: EntryLike[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "reversal") {
      if (entry._id !== undefined) out.add(idOf(entry._id));
      if (entry.reversesEntryId) out.add(idOf(entry.reversesEntryId));
    }
  }
  return out;
}

/// How much approved money a claim has used of its pre-approval's hold, per
/// pre-approval id.
function usedAgainstPreapprovals(requests: RequestLike[]): Map<string, number> {
  const used = new Map<string, number>();
  for (const r of requests) {
    if ((r.kind ?? "claim") !== "claim" || !r.preapprovalId) continue;
    if (r.status !== "approved") continue;
    const key = idOf(r.preapprovalId);
    used.set(key, (used.get(key) ?? 0) + cents(r.approvedCents));
  }
  return used;
}

/// What a request contributes to each bucket. Exported for tests and for the
/// "what changes if I approve this" preview.
export function requestContribution(
  r: RequestLike,
  usedByPreapproval: Map<string, number>
): { spent: number; held: number; pending: number } {
  const kind = r.kind ?? "claim";
  if (kind === "claim") {
    if (r.status === "approved") return { spent: cents(r.approvedCents), held: 0, pending: 0 };
    if (r.status === "pending") return { spent: 0, held: 0, pending: cents(r.amountCents) };
    return { spent: 0, held: 0, pending: 0 };
  }
  // pre-approval
  if (r.status === "approved") {
    const used = usedByPreapproval.get(idOf(r._id)) ?? 0;
    return { spent: 0, held: Math.max(0, cents(r.approvedCents) - used), pending: 0 };
  }
  if (r.status === "pending") return { spent: 0, held: 0, pending: cents(r.amountCents) };
  // fulfilled / released / denied / returned / withdrawn hold nothing
  return { spent: 0, held: 0, pending: 0 };
}

/// Every number for one budget, per line and in total.
///
/// `entries` may include entries for other budgets (a transfer has two
/// sides); only the parts that touch `budgetId` are counted. `lineIds` seeds
/// lines that have no activity yet so they still show up at zero.
export function computeBudgetTotals(
  budgetId: any,
  entries: EntryLike[],
  requests: RequestLike[],
  lineIds: any[] = []
): BudgetTotals {
  const id = idOf(budgetId);
  const lines: Record<LineKey, Totals> = {};
  const line = (key: LineKey) => (lines[key] ??= emptyTotals());
  line(UNASSIGNED);
  for (const l of lineIds) line(lineKey(l));

  const cancelled = cancelledEntryIds(entries);

  for (const entry of entries) {
    if (entry.kind === "reversal") continue;
    if (entry._id !== undefined && cancelled.has(idOf(entry._id))) continue;
    const amount = cents(entry.amountCents);

    if (entry.kind === "transfer" || entry.kind === "rollover") {
      if (entry.from && idOf(entry.from.budgetId) === id) {
        line(lineKey(entry.from.lineId)).fundedCents -= amount;
      }
      if (entry.to && idOf(entry.to.budgetId) === id) {
        line(lineKey(entry.to.lineId)).fundedCents += amount;
      }
      continue;
    }

    if (idOf(entry.budgetId) !== id) continue;
    const t = line(lineKey(entry.lineId));
    switch (entry.kind) {
      case "allocation":
      case "adjustment":
      case "income":
        t.fundedCents += amount;
        break;
      case "direct_spend":
        t.spentCents += amount;
        break;
    }
  }

  const used = usedAgainstPreapprovals(requests);
  for (const r of requests) {
    if (idOf(r.budgetId) !== id) continue;
    const c = requestContribution(r, used);
    const t = line(lineKey(r.lineId));
    t.spentCents += c.spent;
    t.heldCents += c.held;
    t.pendingCents += c.pending;
  }

  const total = emptyTotals();
  for (const t of Object.values(lines)) {
    t.availableCents = t.fundedCents - t.spentCents - t.heldCents;
    total.fundedCents += t.fundedCents;
    total.spentCents += t.spentCents;
    total.heldCents += t.heldCents;
    total.pendingCents += t.pendingCents;
  }
  total.availableCents = total.fundedCents - total.spentCents - total.heldCents;

  return { ...total, lines };
}

/// Share of a budget used, as a whole percent. Held money counts as used: it
/// is spoken for even if the receipt hasn't come in. Null when nothing is
/// funded, since "100% of $0" means nothing.
export function percentUsed(totals: Totals): number | null {
  if (totals.fundedCents <= 0) return null;
  return Math.floor(((totals.spentCents + totals.heldCents) * 100) / totals.fundedCents);
}

export const THRESHOLDS = [80, 100] as const;

/// Thresholds a change pushed the budget across, skipping any already sent.
export function thresholdsCrossed(
  before: Totals,
  after: Totals,
  alreadyNotified: number[] = []
): number[] {
  const a = percentUsed(after);
  if (a === null) return [];
  const b = percentUsed(before) ?? 0;
  return THRESHOLDS.filter((t) => a >= t && b < t && !alreadyNotified.includes(t));
}

// ---------------------------------------------------------------------------
// Over-budget check, run before approving a claim or pre-approval.

export interface OverBudgetCheck {
  /// How far the line would go below zero (0 if it stays at or above zero).
  lineShortCents: number;
  /// How far the whole committee would go below zero.
  committeeShortCents: number;
  /// True when the committee as a whole goes negative. This is the case that
  /// needs the treasurer's explicit, logged override. A single line going
  /// negative while the committee still has money is only a warning.
  needsOverride: boolean;
  lineWarning: boolean;
}

/// `releasingCents` is money this approval frees from a hold: a claim filed
/// against an approved pre-approval stops that pre-approval holding the same
/// money, so it must not be counted twice.
export function checkOverBudget(
  totals: BudgetTotals,
  lineId: any,
  amountCents: number,
  releasingCents = 0
): OverBudgetCheck {
  const amount = Math.max(0, cents(amountCents));
  const release = Math.max(0, Math.min(cents(releasingCents), amount));
  const net = amount - release;
  const lineTotals = totals.lines[lineKey(lineId)] ?? emptyTotals();
  const lineAfter = lineTotals.availableCents - net;
  const committeeAfter = totals.availableCents - net;
  const committeeShortCents = Math.max(0, -committeeAfter);
  // Only count the part of the shortfall this approval causes. A committee
  // already underwater still needs an override for new spending, but the
  // reported shortfall should be about this request.
  const lineShortCents = Math.max(0, -lineAfter);
  return {
    lineShortCents,
    committeeShortCents,
    needsOverride: net > 0 && committeeAfter < 0,
    lineWarning: net > 0 && lineAfter < 0 && committeeAfter >= 0,
  };
}

/// The hold a claim against `preapproval` would release on approval.
export function releasableHoldCents(
  preapproval: RequestLike | null | undefined,
  requests: RequestLike[]
): number {
  if (!preapproval || preapproval.status !== "approved") return 0;
  const used = usedAgainstPreapprovals(requests).get(idOf(preapproval._id)) ?? 0;
  return Math.max(0, cents(preapproval.approvedCents) - used);
}

// ---------------------------------------------------------------------------
// Request state machine

export type RequestKind = "claim" | "preapproval";

/// Every legal status change, by who may make it. Anything not listed is
/// refused. `payout` is not a status: a paid claim stays `approved`, with
/// `payout.status` moving from unpaid to paid.
export const REQUEST_TRANSITIONS: Record<
  RequestKind,
  Record<string, { head: string[]; treasurer: string[] }>
> = {
  claim: {
    pending: { head: ["withdrawn"], treasurer: ["approved", "denied", "returned"] },
    returned: { head: ["pending", "withdrawn"], treasurer: [] },
    approved: { head: [], treasurer: [] },
    denied: { head: [], treasurer: [] },
    withdrawn: { head: [], treasurer: [] },
  },
  preapproval: {
    pending: { head: ["withdrawn"], treasurer: ["approved", "denied", "returned"] },
    returned: { head: ["pending", "withdrawn"], treasurer: [] },
    approved: { head: ["released"], treasurer: ["released", "fulfilled"] },
    fulfilled: { head: [], treasurer: [] },
    released: { head: [], treasurer: [] },
    denied: { head: [], treasurer: [] },
    withdrawn: { head: [], treasurer: [] },
  },
};

export function canTransition(
  kind: string,
  from: string,
  to: string,
  as: "head" | "treasurer"
): boolean {
  const table = REQUEST_TRANSITIONS[(kind === "preapproval" ? "preapproval" : "claim") as RequestKind];
  return Boolean(table[from]?.[as]?.includes(to));
}

export interface ReviewDecision {
  action: "approve" | "deny" | "return";
  requestedCents: number;
  approvedCents?: number | null;
  note?: string;
  overrideConfirmed?: boolean;
}

export interface ReviewOutcome {
  ok: boolean;
  error?: string;
  status?: string;
  approvedCents?: number | null;
  partial?: boolean;
}

/// Validates a treasurer decision. Partial approval, denial and send-back all
/// need a note, because the head is going to read why. An approval that takes
/// the committee negative needs `overrideConfirmed`.
export function validateReview(
  decision: ReviewDecision,
  overBudget: OverBudgetCheck | null
): ReviewOutcome {
  const note = (decision.note ?? "").trim();
  const requested = cents(decision.requestedCents);

  if (decision.action === "deny" || decision.action === "return") {
    if (!note) return { ok: false, error: "A note is required so the head knows why" };
    return {
      ok: true,
      status: decision.action === "deny" ? "denied" : "returned",
      approvedCents: null,
      partial: false,
    };
  }

  const approved =
    decision.approvedCents === undefined || decision.approvedCents === null
      ? requested
      : cents(decision.approvedCents);
  if (approved <= 0) return { ok: false, error: "Approved amount must be greater than zero" };
  if (approved > requested) {
    return { ok: false, error: "Approved amount can't be more than what was asked for" };
  }
  const partial = approved < requested;
  if (partial && !note) {
    return { ok: false, error: "A note is required when approving less than was asked for" };
  }
  if (overBudget?.needsOverride && !decision.overrideConfirmed) {
    return { ok: false, error: "This takes the committee over budget and needs an override" };
  }
  return { ok: true, status: "approved", approvedCents: approved, partial };
}

// ---------------------------------------------------------------------------
// Moving money

/// Transfers, reallocations and negative adjustments may only move money that
/// is actually free on the source line. Moving held or spent money would push
/// the line negative without anyone ticking an override, which is the one
/// thing the override exists to make deliberate.
export function validateMove(
  sourceTotals: BudgetTotals,
  sourceLineId: any,
  amountCents: number
): string | null {
  const amount = cents(amountCents);
  if (amount <= 0) return "Amount must be greater than zero";
  const available = (sourceTotals.lines[lineKey(sourceLineId)] ?? emptyTotals()).availableCents;
  if (amount > available) {
    return `Only ${dollars(Math.max(0, available))} is free on that line`;
  }
  return null;
}

/// Money left at term close that could roll over. Never negative.
export function leftoverCents(totals: Totals): number {
  return Math.max(0, totals.availableCents);
}

// ---------------------------------------------------------------------------
// Proposals and packages

export interface ProposalLineInput {
  _id?: any;
  name: string;
  amountCents: number;
  reason?: string;
}

export const MAX_PROPOSAL_LINES = 40;

/// Clean and validate proposal lines from a request body.
export function normalizeProposalLines(
  raw: any
): { lines: ProposalLineInput[]; error: string | null } {
  if (!Array.isArray(raw)) return { lines: [], error: "lines must be a list" };
  if (raw.length > MAX_PROPOSAL_LINES) {
    return { lines: [], error: `A proposal can have at most ${MAX_PROPOSAL_LINES} lines` };
  }
  const lines: ProposalLineInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = String(item?.name ?? "").trim();
    if (!name) return { lines: [], error: "Every line needs a name" };
    if (name.length > 80) return { lines: [], error: "Line names must be 80 characters or fewer" };
    const lower = name.toLowerCase();
    if (seen.has(lower)) return { lines: [], error: `"${name}" is listed twice` };
    seen.add(lower);
    const amount = Number(item?.amountCents);
    if (!Number.isFinite(amount) || amount < 0 || Math.round(amount) !== amount) {
      return { lines: [], error: `"${name}" needs a whole-cent amount of zero or more` };
    }
    lines.push({
      ...(item?._id ? { _id: item._id } : {}),
      name,
      amountCents: amount,
      reason: String(item?.reason ?? "").trim().slice(0, 500),
    });
  }
  return { lines, error: null };
}

export function proposalTotalCents(lines: { amountCents: number }[]): number {
  return lines.reduce((sum, l) => sum + cents(l.amountCents), 0);
}

export interface LineDiff {
  added: { name: string; amountCents: number }[];
  removed: { name: string; amountCents: number }[];
  changed: { name: string; fromCents: number; toCents: number }[];
  renamed: { from: string; to: string }[];
}

/// What changed between two versions of a proposal, for the log and for the
/// head's "the treasurer changed your proposal" notice. Lines match by `_id`
/// when both sides have one, otherwise by name.
export function diffProposalLines(
  before: ProposalLineInput[],
  after: ProposalLineInput[]
): LineDiff {
  const diff: LineDiff = { added: [], removed: [], changed: [], renamed: [] };
  const keyOf = (l: ProposalLineInput) => (l._id ? `id:${idOf(l._id)}` : `name:${l.name.toLowerCase()}`);
  const byName = new Map(before.map((l) => [l.name.toLowerCase(), l]));
  const byId = new Map(before.filter((l) => l._id).map((l) => [idOf(l._id), l]));
  const matched = new Set<string>();

  for (const next of after) {
    const prev =
      (next._id && byId.get(idOf(next._id))) || byName.get(next.name.toLowerCase());
    if (!prev) {
      diff.added.push({ name: next.name, amountCents: cents(next.amountCents) });
      continue;
    }
    matched.add(keyOf(prev));
    if (prev.name !== next.name) diff.renamed.push({ from: prev.name, to: next.name });
    if (cents(prev.amountCents) !== cents(next.amountCents)) {
      diff.changed.push({
        name: next.name,
        fromCents: cents(prev.amountCents),
        toCents: cents(next.amountCents),
      });
    }
  }
  for (const prev of before) {
    if (!matched.has(keyOf(prev))) {
      diff.removed.push({ name: prev.name, amountCents: cents(prev.amountCents) });
    }
  }
  return diff;
}

export function diffIsEmpty(d: LineDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && !d.renamed.length;
}

export interface DuesSuggestionInput {
  totalCents: number;
  expectedIncomeCents?: number;
  carryoverCents?: number;
  activeCount: number;
}

/// Per-member dues that cover the package: what has to be raised, split
/// evenly across actives, rounded up to the whole dollar so the chapter never
/// lands a few cents short. Null when there is nobody to split it across.
export function suggestDuesCents(input: DuesSuggestionInput): number | null {
  const count = Math.floor(Number(input.activeCount) || 0);
  if (count <= 0) return null;
  const need = Math.max(
    0,
    cents(input.totalCents) - cents(input.expectedIncomeCents ?? 0) - cents(input.carryoverCents ?? 0)
  );
  if (need === 0) return 0;
  return Math.ceil(need / count / 100) * 100;
}

/// What dues at `perMemberCents` would raise against the need: positive is a
/// surplus, negative a shortfall. Shown beside the editable dues number.
export function duesCoverageCents(input: DuesSuggestionInput, perMemberCents: number): number {
  const count = Math.floor(Number(input.activeCount) || 0);
  const need = Math.max(
    0,
    cents(input.totalCents) - cents(input.expectedIncomeCents ?? 0) - cents(input.carryoverCents ?? 0)
  );
  return cents(perMemberCents) * count - need;
}

/// Yes beats No by simple majority of votes cast; abstentions don't count
/// either way. Ties fail. The chapter's bylaws may say otherwise for budgets,
/// in which case this is the one place to change.
export function voteCarries(yes: number, no: number): boolean {
  return Math.max(0, Math.floor(yes)) > Math.max(0, Math.floor(no));
}

// ---------------------------------------------------------------------------
// Proposal versioning

export type ProposalAction = "saved" | "submitted" | "treasurer_edit";

export interface ProposalSnapshot {
  version: number;
  currentAction: ProposalAction;
  status: string;
  lines: ProposalLineInput[];
  expectedIncomeCents: number;
  note: string;
  lastEditedBy?: any;
  updatedAt?: Date | string | null;
}

export interface ProposalWriteInput {
  action: ProposalAction;
  as: "head" | "treasurer";
  lines: ProposalLineInput[];
  expectedIncomeCents: number;
  note: string;
}

export interface ProposalWritePlan {
  ok: boolean;
  error?: string;
  /// The version the proposal will be at after this write.
  version: number;
  status: string;
  /// The outgoing version to append to `history`, or null when the write
  /// overwrites an unseen draft in place.
  archive: ProposalSnapshot | null;
  /// Which log event this write is.
  event:
    | "proposal_saved"
    | "proposal_submitted"
    | "proposal_resubmitted"
    | "proposal_edited";
}

const HEAD_EDITABLE = ["draft", "returned", "submitted"];
const TREASURER_EDITABLE = ["submitted", "returned"];

/// Decides what a write to a proposal does, without touching the database.
///
/// Drafts are not versions: until something is submitted nobody else has
/// seen it, so a head saving over their own draft (or submitting it) keeps
/// the version number and archives nothing. Once a version has been
/// submitted or edited by the treasurer it is part of the record, and the
/// next change archives it and bumps the version.
///
/// A head can't save a draft over a proposal they already submitted (that
/// would quietly pull it out of the treasurer's inbox); they submit the
/// change instead. The treasurer edits only what has been submitted.
export function planProposalWrite(
  current: ProposalSnapshot | null,
  input: ProposalWriteInput
): ProposalWritePlan {
  const fail = (error: string): ProposalWritePlan => ({
    ok: false,
    error,
    version: current?.version ?? 1,
    status: current?.status ?? "draft",
    archive: null,
    event: "proposal_saved",
  });

  if (input.as === "treasurer" && input.action !== "treasurer_edit") {
    return fail("The treasurer edits proposals; only the head saves and submits them");
  }
  if (input.as === "head" && input.action === "treasurer_edit") {
    return fail("Only the treasurer can edit a submitted proposal");
  }

  if (!current) {
    if (input.action === "treasurer_edit") return fail("There is no proposal to edit yet");
    return {
      ok: true,
      version: 1,
      status: input.action === "submitted" ? "submitted" : "draft",
      archive: null,
      event: input.action === "submitted" ? "proposal_submitted" : "proposal_saved",
    };
  }

  if (current.status === "approved" || current.status === "rejected") {
    return fail("This proposal has already gone to a vote and can't be changed");
  }

  if (input.as === "head") {
    if (!HEAD_EDITABLE.includes(current.status)) return fail("This proposal can't be edited right now");
    if (input.action === "saved" && current.status === "submitted") {
      return fail("Already submitted. Submit your changes to update it.");
    }
  } else if (!TREASURER_EDITABLE.includes(current.status)) {
    return fail("Only a submitted proposal can be edited by the treasurer");
  }

  const draftInPlace = current.currentAction === "saved";
  const archive = draftInPlace ? null : current;
  const version = draftInPlace ? current.version : current.version + 1;

  if (input.action === "saved") {
    return {
      ok: true,
      version,
      // A head reworking a returned proposal keeps it marked returned until
      // they submit, so the treasurer's note stays in front of them.
      status: current.status === "returned" ? "returned" : "draft",
      archive,
      event: "proposal_saved",
    };
  }
  if (input.action === "submitted") {
    // Anything that has been in front of the treasurer before, or that the
    // treasurer sent back, is a resubmission.
    const before = current.status === "returned" || current.status === "submitted" || current.version > 1;
    return {
      ok: true,
      version,
      status: "submitted",
      archive,
      event: before ? "proposal_resubmitted" : "proposal_submitted",
    };
  }
  return { ok: true, version, status: current.status, archive, event: "proposal_edited" };
}

/// The treasurer sends a proposal back to its head.
export function canReturnProposal(status: string): boolean {
  return status === "submitted";
}

/// A diff as one plain sentence for the log and notifications. No em dashes:
/// this text reaches members.
export function describeLineDiff(diff: LineDiff): string {
  const parts: string[] = [];
  for (const r of diff.renamed) parts.push(`renamed ${r.from} to ${r.to}`);
  for (const c of diff.changed) parts.push(`${c.name} ${dollars(c.fromCents)} to ${dollars(c.toCents)}`);
  for (const a of diff.added) parts.push(`added ${a.name} (${dollars(a.amountCents)})`);
  for (const r of diff.removed) parts.push(`removed ${r.name} (${dollars(r.amountCents)})`);
  if (!parts.length) return "no line changes";
  const sentence = parts.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export { dollars as formatBudgetCents };

/// A "YYYY-MM-DD" from a date picker, as noon in Phoenix. Midnight UTC is
/// still the previous evening in Arizona, so a vote taken on the 5th would
/// read as the 4th everywhere it is shown. Anything else is parsed as given.
export function calendarDayAtPhoenixNoon(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T19:00:00.000Z`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
