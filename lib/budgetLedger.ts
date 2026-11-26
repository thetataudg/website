// lib/budgetLedger.ts
// Live committee budgets: reading them with derived totals, and the
// treasurer's tools for putting money in, taking it out and moving it.
//
// Every movement is one BudgetEntry insert. Totals are never stored.
import mongoose from "mongoose";
import CommitteeBudget from "@/lib/models/CommitteeBudget";
import BudgetEntry from "@/lib/models/BudgetEntry";
import Committee from "@/lib/models/Committee";
import Reimbursement from "@/lib/models/Reimbursement";
import { recordBudgetEvent, recordBudgetEvents } from "@/lib/budgetEvents";
import { BudgetHttpError, BudgetViewer, isObjectId, requireTreasuryViewer } from "@/lib/budgetAuth";
import {
  calendarDayAtPhoenixNoon,
  BudgetTotals,
  Totals,
  UNASSIGNED,
  computeBudgetTotals,
  formatBudgetCents,
  lineKey,
  percentUsed,
  validateMove,
} from "@/lib/budgets";

export const COMMITTEE_REQUEST_FILTER = { committeeId: { $ne: null } };

export async function entriesTouching(budgetIds: any[]) {
  if (!budgetIds.length) return [];
  return BudgetEntry.find({
    $or: [
      { budgetId: { $in: budgetIds } },
      { "from.budgetId": { $in: budgetIds } },
      { "to.budgetId": { $in: budgetIds } },
    ],
  })
    .sort({ occurredAt: 1 })
    .lean<any[]>();
}

/// Totals for one budget doc.
export async function totalsFor(budget: any): Promise<BudgetTotals> {
  const [entries, requests] = await Promise.all([
    entriesTouching([budget._id]),
    Reimbursement.find({ budgetId: budget._id }).lean<any[]>(),
  ]);
  return computeBudgetTotals(
    budget._id,
    entries,
    requests,
    (budget.lines ?? []).map((l: any) => l._id)
  );
}

/// Totals for many budgets in two queries.
export async function totalsForMany(budgets: any[]): Promise<Map<string, BudgetTotals>> {
  const ids = budgets.map((b) => b._id);
  const [entries, requests] = await Promise.all([
    entriesTouching(ids),
    Reimbursement.find({ budgetId: { $in: ids } }).lean<any[]>(),
  ]);
  const out = new Map<string, BudgetTotals>();
  for (const b of budgets) {
    out.set(
      String(b._id),
      computeBudgetTotals(b._id, entries, requests, (b.lines ?? []).map((l: any) => l._id))
    );
  }
  return out;
}

export interface BudgetLineDTO {
  _id: string | null; // null = Unassigned
  name: string;
  archived: boolean;
  totals: Totals;
}

export interface BudgetDTO {
  _id: string;
  term: string;
  status: string;
  committee: { _id: string; name: string; color: string | null };
  totals: Totals;
  percentUsed: number | null;
  lines: BudgetLineDTO[];
  closedAt: string | null;
}

export function serializeBudget(budget: any, committee: any, totals: BudgetTotals): BudgetDTO {
  const lines: BudgetLineDTO[] = (budget.lines ?? []).map((l: any) => ({
    _id: String(l._id),
    name: l.name,
    archived: Boolean(l.archived),
    totals: totals.lines[lineKey(l._id)] ?? { fundedCents: 0, spentCents: 0, heldCents: 0, pendingCents: 0, availableCents: 0 },
  }));
  const unassigned = totals.lines[UNASSIGNED];
  // Unassigned only shows when it has something on it, or there are no lines.
  if (
    !lines.length ||
    (unassigned &&
      (unassigned.fundedCents || unassigned.spentCents || unassigned.heldCents || unassigned.pendingCents))
  ) {
    lines.push({ _id: null, name: "Unassigned", archived: false, totals: unassigned });
  }
  const { lines: _l, ...overall } = totals;
  return {
    _id: String(budget._id),
    term: budget.term,
    status: budget.status,
    committee: { _id: String(committee?._id ?? budget.committeeId), name: committee?.name ?? "", color: committee?.color ?? null },
    totals: overall,
    percentUsed: percentUsed(overall),
    lines,
    closedAt: budget.closedAt ? new Date(budget.closedAt).toISOString() : null,
  };
}

export async function loadBudget(committeeId: any, term: string) {
  return CommitteeBudget.findOne({ committeeId, term }).lean<any>();
}

export async function loadBudgetById(budgetId: any) {
  if (!isObjectId(budgetId)) throw new BudgetHttpError(400, "Invalid budget");
  const budget = await CommitteeBudget.findById(budgetId).lean<any>();
  if (!budget) throw new BudgetHttpError(404, "Budget not found");
  return budget;
}

/// Find or create a committee's budget for a term. Creation is logged once;
/// a racing second create hits the unique index and reads the winner.
export async function ensureBudget(
  committeeId: any,
  term: string,
  actorId: any,
  init: { lines?: { name: string }[]; proposalId?: any; packageId?: any } = {}
) {
  const existing = await loadBudget(committeeId, term);
  if (existing) return { budget: existing, created: false };
  try {
    const doc = await CommitteeBudget.create({
      committeeId,
      term,
      lines: (init.lines ?? []).map((l) => ({ name: l.name })),
      proposalId: init.proposalId ?? null,
      packageId: init.packageId ?? null,
    });
    const committee = await Committee.findById(committeeId).select("name").lean<any>();
    await recordBudgetEvent({
      term,
      committeeId,
      budgetId: doc._id,
      actorId,
      type: "budget_created",
      summary: `Created ${committee?.name ?? "committee"}'s ${term} budget`,
      refs: { proposalId: init.proposalId ?? null, packageId: init.packageId ?? null },
    });
    return { budget: doc.toObject(), created: true };
  } catch (err: any) {
    if (err?.code === 11000) return { budget: await loadBudget(committeeId, term), created: false };
    throw err;
  }
}

export async function listBudgets(term: string): Promise<BudgetDTO[]> {
  const budgets = await CommitteeBudget.find({ term }).lean<any[]>();
  const committees = await Committee.find({ _id: { $in: budgets.map((b) => b.committeeId) } })
    .select("_id name color")
    .lean<any[]>();
  const byId = new Map(committees.map((c) => [String(c._id), c]));
  const totals = await totalsForMany(budgets);
  return budgets
    .map((b) => serializeBudget(b, byId.get(String(b.committeeId)), totals.get(String(b._id))!))
    .sort((a, b) => a.committee.name.localeCompare(b.committee.name));
}

function requireOpen(budget: any) {
  if (budget.status !== "open") throw new BudgetHttpError(409, "This budget is closed");
}

function requireLine(budget: any, lineId: any, { allowArchived = false } = {}) {
  if (lineId === null || lineId === undefined || lineId === "") return null;
  const line = (budget.lines ?? []).find((l: any) => String(l._id) === String(lineId));
  if (!line) throw new BudgetHttpError(400, "That line isn't on this budget");
  if (line.archived && !allowArchived) throw new BudgetHttpError(409, `${line.name} is archived`);
  return line;
}

function lineName(budget: any, lineId: any): string {
  if (!lineId) return "Unassigned";
  return (budget.lines ?? []).find((l: any) => String(l._id) === String(lineId))?.name ?? "a line";
}

function readPositiveCents(raw: any, label = "Amount"): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.round(n) !== n || n <= 0) {
    throw new BudgetHttpError(400, `${label} must be a whole number of cents above zero`);
  }
  return n;
}

function oid(value: any) {
  return value ? new mongoose.Types.ObjectId(String(value)) : null;
}

async function committeeName(id: any) {
  return (await Committee.findById(id).select("name").lean<any>())?.name ?? "committee";
}

// ---------------------------------------------------------------------------
// Lines

export async function addLine(viewer: BudgetViewer, budgetId: any, name: string) {
  requireTreasuryViewer(viewer);
  const budget = await loadBudgetById(budgetId);
  requireOpen(budget);
  const clean = String(name ?? "").trim().slice(0, 80);
  if (!clean) throw new BudgetHttpError(400, "Name the line");
  if ((budget.lines ?? []).some((l: any) => !l.archived && l.name.toLowerCase() === clean.toLowerCase())) {
    throw new BudgetHttpError(409, `There's already a line called ${clean}`);
  }
  const lineId = new mongoose.Types.ObjectId();
  await CommitteeBudget.updateOne({ _id: budget._id }, { $push: { lines: { _id: lineId, name: clean } } });
  await recordBudgetEvent({
    term: budget.term,
    committeeId: budget.committeeId,
    budgetId: budget._id,
    actorId: viewer._id,
    type: "line_added",
    summary: `Added line ${clean}`,
    refs: { lineId },
  });
  return lineId;
}

export async function renameLine(viewer: BudgetViewer, budgetId: any, lineId: any, name: string) {
  requireTreasuryViewer(viewer);
  const budget = await loadBudgetById(budgetId);
  requireOpen(budget);
  const line = requireLine(budget, lineId, { allowArchived: true });
  if (!line) throw new BudgetHttpError(400, "Unassigned can't be renamed");
  const clean = String(name ?? "").trim().slice(0, 80);
  if (!clean) throw new BudgetHttpError(400, "Name the line");
  if (clean === line.name) return;
  await CommitteeBudget.updateOne({ _id: budget._id, "lines._id": line._id }, { $set: { "lines.$.name": clean } });
  await recordBudgetEvent({
    term: budget.term,
    committeeId: budget.committeeId,
    budgetId: budget._id,
    actorId: viewer._id,
    type: "line_renamed",
    summary: `Renamed line ${line.name} to ${clean}`,
    before: { name: line.name },
    after: { name: clean },
    refs: { lineId: line._id },
  });
}

/// Archiving a line moves anything left on it to Unassigned in the same
/// breath, so no money is ever stranded on a line nobody can see.
export async function archiveLine(viewer: BudgetViewer, budgetId: any, lineId: any) {
  requireTreasuryViewer(viewer);
  const budget = await loadBudgetById(budgetId);
  requireOpen(budget);
  const line = requireLine(budget, lineId, { allowArchived: true });
  if (!line) throw new BudgetHttpError(400, "Unassigned can't be archived");
  if (line.archived) return;
  const totals = await totalsFor(budget);
  const left = totals.lines[lineKey(line._id)];
  if (left && (left.pendingCents > 0 || left.heldCents > 0)) {
    throw new BudgetHttpError(409, `${line.name} has open requests. Review or move them first.`);
  }
  await CommitteeBudget.updateOne({ _id: budget._id, "lines._id": line._id }, { $set: { "lines.$.archived": true } });
  let moved: any = null;
  if (left && left.availableCents > 0) {
    moved = await BudgetEntry.create({
      kind: "transfer",
      term: budget.term,
      from: { budgetId: budget._id, committeeId: budget.committeeId, lineId: line._id },
      to: { budgetId: budget._id, committeeId: budget.committeeId, lineId: null },
      amountCents: left.availableCents,
      note: `Moved off archived line ${line.name}`,
      actorId: viewer._id,
    });
  }
  await recordBudgetEvent({
    term: budget.term,
    committeeId: budget.committeeId,
    budgetId: budget._id,
    actorId: viewer._id,
    type: "line_archived",
    amountCents: left?.availableCents ?? 0,
    summary:
      `Archived line ${line.name}` +
      (left && left.availableCents > 0 ? `, ${formatBudgetCents(left.availableCents)} moved to Unassigned` : ""),
    refs: { lineId: line._id, entryId: moved?._id ?? null },
  });
}

// ---------------------------------------------------------------------------
// Money

export interface EntryInput {
  kind: "allocation" | "adjustment" | "income" | "direct_spend" | "transfer";
  budgetId: any;
  lineId?: any;
  amountCents: any;
  note?: string;
  receiptUrls?: string[];
  occurredOn?: string | null;
  toBudgetId?: any;
  toLineId?: any;
  /// Set when the entry comes from an approved package or amendment.
  packageId?: any;
  proposalId?: any;
}

const KIND_EVENT = {
  allocation: "budget_allocated",
  adjustment: "budget_adjusted",
  income: "income_recorded",
  direct_spend: "direct_spend_recorded",
} as const;

export async function addEntry(viewer: BudgetViewer, input: EntryInput) {
  requireTreasuryViewer(viewer);
  const budget = await loadBudgetById(input.budgetId);
  requireOpen(budget);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  const lineId = oid(input.lineId || null);
  requireLine(budget, lineId);

  if (input.kind === "transfer") {
    const amount = readPositiveCents(input.amountCents);
    const target = input.toBudgetId && String(input.toBudgetId) !== String(budget._id)
      ? await loadBudgetById(input.toBudgetId)
      : budget;
    requireOpen(target);
    if (target.term !== budget.term) throw new BudgetHttpError(400, "Transfers stay within one term. Use rollover between terms.");
    const toLineId = oid(input.toLineId || null);
    requireLine(target, toLineId);
    const sameLine = String(target._id) === String(budget._id) && String(toLineId ?? "") === String(lineId ?? "");
    if (sameLine) throw new BudgetHttpError(400, "Pick a different line to move money to");

    const moveError = validateMove(await totalsFor(budget), lineId, amount);
    if (moveError) throw new BudgetHttpError(409, moveError);

    const entry = await BudgetEntry.create({
      kind: "transfer",
      term: budget.term,
      from: { budgetId: budget._id, committeeId: budget.committeeId, lineId },
      to: { budgetId: target._id, committeeId: target.committeeId, lineId: toLineId },
      amountCents: amount,
      note,
      actorId: viewer._id,
      refs: { packageId: input.packageId ?? null },
    });

    if (String(target._id) === String(budget._id)) {
      await recordBudgetEvent({
        term: budget.term,
        committeeId: budget.committeeId,
        budgetId: budget._id,
        actorId: viewer._id,
        type: "lines_reallocated",
        amountCents: amount,
        summary: `Moved ${formatBudgetCents(amount)} from ${lineName(budget, lineId)} to ${lineName(budget, toLineId)}` + (note ? `: ${note}` : ""),
        refs: { entryId: entry._id, lineId },
      });
    } else {
      const [fromName, toName] = await Promise.all([committeeName(budget.committeeId), committeeName(target.committeeId)]);
      await recordBudgetEvents([
        {
          term: budget.term,
          committeeId: budget.committeeId,
          budgetId: budget._id,
          actorId: viewer._id,
          type: "transfer_out",
          amountCents: -amount,
          summary: `Moved ${formatBudgetCents(amount)} to ${toName}` + (note ? `: ${note}` : ""),
          refs: { entryId: entry._id, lineId, otherCommitteeId: target.committeeId },
        },
        {
          term: budget.term,
          committeeId: target.committeeId,
          budgetId: target._id,
          actorId: viewer._id,
          type: "transfer_in",
          amountCents: amount,
          summary: `Received ${formatBudgetCents(amount)} from ${fromName}` + (note ? `: ${note}` : ""),
          refs: { entryId: entry._id, lineId: toLineId, otherCommitteeId: budget.committeeId },
        },
      ]);
    }
    return entry.toObject();
  }

  let amount: number;
  if (input.kind === "adjustment") {
    amount = Number(input.amountCents);
    if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount === 0) {
      throw new BudgetHttpError(400, "Adjustment must be a whole number of cents, not zero");
    }
    if (amount < 0) {
      const moveError = validateMove(await totalsFor(budget), lineId, -amount);
      if (moveError) throw new BudgetHttpError(409, moveError);
    }
    if (!note) throw new BudgetHttpError(400, "Say why the total is changing");
  } else {
    amount = readPositiveCents(input.amountCents);
  }

  let occurredOn: Date | null = null;
  if (input.kind === "direct_spend") {
    if (!note) throw new BudgetHttpError(400, "Say what was bought");
    occurredOn = input.occurredOn ? calendarDayAtPhoenixNoon(input.occurredOn) ?? new Date(NaN) : new Date();
    if (Number.isNaN(occurredOn.getTime())) throw new BudgetHttpError(400, "Invalid purchase date");
  }

  const entry = await BudgetEntry.create({
    kind: input.kind,
    term: budget.term,
    budgetId: budget._id,
    committeeId: budget.committeeId,
    lineId,
    amountCents: amount,
    note,
    receiptUrls: Array.isArray(input.receiptUrls) ? input.receiptUrls.map(String).slice(0, 10) : [],
    occurredOn,
    actorId: viewer._id,
    refs: { packageId: input.packageId ?? null, proposalId: input.proposalId ?? null },
  });

  const where = lineName(budget, lineId);
  const summaries = {
    allocation: `Allocated ${formatBudgetCents(amount)} to ${where}`,
    adjustment: `${amount > 0 ? "Raised" : "Lowered"} ${where} by ${formatBudgetCents(Math.abs(amount))}`,
    income: `Recorded ${formatBudgetCents(amount)} income on ${where}`,
    direct_spend: `Chapter spent ${formatBudgetCents(amount)} from ${where}`,
  } as const;
  await recordBudgetEvent({
    term: budget.term,
    committeeId: budget.committeeId,
    budgetId: budget._id,
    actorId: viewer._id,
    type: KIND_EVENT[input.kind],
    amountCents: input.kind === "direct_spend" ? -amount : amount,
    summary: summaries[input.kind] + (note ? `: ${note}` : ""),
    refs: { entryId: entry._id, lineId, packageId: input.packageId ?? null, proposalId: input.proposalId ?? null },
  });
  return entry.toObject();
}

/// Cancel an entry with a reversal. The original stays.
export async function reverseEntry(viewer: BudgetViewer, entryId: any, note: string) {
  requireTreasuryViewer(viewer);
  if (!isObjectId(entryId)) throw new BudgetHttpError(400, "Invalid entry");
  const entry = await BudgetEntry.findById(entryId).lean<any>();
  if (!entry) throw new BudgetHttpError(404, "Entry not found");
  if (entry.kind === "reversal") throw new BudgetHttpError(400, "A reversal can't be reversed. Record a new entry instead.");
  if (entry.kind === "rollover") throw new BudgetHttpError(400, "Rollovers are undone by reopening the term close");
  const reason = String(note ?? "").trim();
  if (!reason) throw new BudgetHttpError(400, "Say why this is being reversed");
  if (await BudgetEntry.exists({ reversesEntryId: entry._id })) {
    throw new BudgetHttpError(409, "That entry was already reversed");
  }

  const sideBudgets = entry.kind === "transfer" ? [entry.from?.budgetId, entry.to?.budgetId] : [entry.budgetId];
  const budgets = await Promise.all(sideBudgets.filter(Boolean).map((id: any) => loadBudgetById(id)));
  budgets.forEach(requireOpen);

  // Reversing money in (allocation, income, positive adjustment, transfer
  // in) takes it back out, which must not push the line negative.
  const receiving =
    entry.kind === "transfer"
      ? { budget: budgets.find((b) => String(b._id) === String(entry.to.budgetId)), lineId: entry.to.lineId, amount: entry.amountCents }
      : ["allocation", "income"].includes(entry.kind) || (entry.kind === "adjustment" && entry.amountCents > 0)
        ? { budget: budgets[0], lineId: entry.lineId, amount: entry.amountCents }
        : null;
  if (receiving?.budget) {
    const moveError = validateMove(await totalsFor(receiving.budget), receiving.lineId, receiving.amount);
    if (moveError) throw new BudgetHttpError(409, `Can't reverse: ${moveError}`);
  }

  let reversal: any;
  try {
    reversal = await BudgetEntry.create({
      kind: "reversal",
      term: entry.term,
      budgetId: entry.budgetId ?? entry.from?.budgetId ?? null,
      committeeId: entry.committeeId ?? entry.from?.committeeId ?? null,
      lineId: entry.lineId ?? null,
      // Carry the transfer's sides so the reversal is loaded by both budgets'
      // queries. The math skips reversals and cancels their target by id, so
      // the sides are for finding it, never for counting it.
      from: entry.from ?? null,
      to: entry.to ?? null,
      amountCents: entry.amountCents,
      note: reason.slice(0, 1000),
      reversesEntryId: entry._id,
      actorId: viewer._id,
    });
  } catch (err: any) {
    if (err?.code === 11000) throw new BudgetHttpError(409, "That entry was already reversed");
    throw err;
  }
  await recordBudgetEvents(
    budgets.map((b) => ({
      term: entry.term,
      committeeId: b.committeeId,
      budgetId: b._id,
      actorId: viewer._id,
      type: "entry_reversed" as const,
      amountCents: entry.amountCents,
      summary: `Reversed ${entry.kind.replace("_", " ")} of ${formatBudgetCents(Math.abs(entry.amountCents))}: ${reason}`,
      refs: { entryId: reversal._id },
      meta: { reversed: String(entry._id) },
    }))
  );
  return reversal.toObject();
}

export interface EntryDTO {
  _id: string;
  kind: string;
  amountCents: number;
  note: string;
  lineId: string | null;
  from: { budgetId: string | null; lineId: string | null; committeeId: string | null } | null;
  to: { budgetId: string | null; lineId: string | null; committeeId: string | null } | null;
  occurredAt: string;
  occurredOn: string | null;
  receiptUrls: string[];
  reversed: boolean;
  reversesEntryId: string | null;
}

export function serializeEntries(entries: any[]): EntryDTO[] {
  const reversed = new Set(entries.filter((e) => e.reversesEntryId).map((e) => String(e.reversesEntryId)));
  const side = (s: any) =>
    s ? { budgetId: s.budgetId ? String(s.budgetId) : null, lineId: s.lineId ? String(s.lineId) : null, committeeId: s.committeeId ? String(s.committeeId) : null } : null;
  return entries.map((e) => ({
    _id: String(e._id),
    kind: e.kind,
    amountCents: e.amountCents,
    note: e.note ?? "",
    lineId: e.lineId ? String(e.lineId) : null,
    from: side(e.from),
    to: side(e.to),
    occurredAt: new Date(e.occurredAt).toISOString(),
    occurredOn: e.occurredOn ? new Date(e.occurredOn).toISOString() : null,
    receiptUrls: e.receiptUrls ?? [],
    reversed: reversed.has(String(e._id)),
    reversesEntryId: e.reversesEntryId ? String(e.reversesEntryId) : null,
  }));
}
