// lib/budgetPackages.ts
// What the chapter votes on, how the result is captured, what approval
// creates, and the dues number that falls out of it.
import mongoose from "mongoose";
import BudgetPackage from "@/lib/models/BudgetPackage";
import BudgetProposal from "@/lib/models/BudgetProposal";
import BudgetEntry from "@/lib/models/BudgetEntry";
import CommitteeBudget from "@/lib/models/CommitteeBudget";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import Vote from "@/lib/models/Vote";
import { recordBudgetEvent, recordBudgetEvents } from "@/lib/budgetEvents";
import { BudgetHttpError, BudgetViewer, isObjectId, requireTreasuryViewer } from "@/lib/budgetAuth";
import { ensureBudget, loadBudget, loadBudgetById } from "@/lib/budgetLedger";
import {
  calendarDayAtPhoenixNoon,
  duesCoverageCents,
  formatBudgetCents,
  proposalTotalCents,
  suggestDuesCents,
  voteCarries,
} from "@/lib/budgets";

export const VOTE_YES = "Yes";
export const VOTE_NO = "No";
/// The ballot's own abstain choice. The vote UI offers it on every
/// election; it counts toward turnout and nothing else.
export const VOTE_ABSTAIN = "Abstain";

export interface PackageDTO {
  _id: string;
  term: string;
  kind: string;
  status: string;
  title: string;
  items: {
    proposalId: string;
    committeeId: string | null;
    committeeName: string;
    version: number;
    totalCents: number;
    expectedIncomeCents: number;
    applied: boolean;
  }[];
  amendment: {
    committeeId: string | null;
    committeeName: string;
    budgetId: string | null;
    lineId: string | null;
    amountCents: number;
    reason: string;
    applied: boolean;
  } | null;
  totalCents: number;
  expectedIncomeCents: number;
  carryoverCents: number;
  activeCount: number;
  suggestedDuesCents: number | null;
  finalDuesCents: number | null;
  coverageCents: number | null;
  duesAssignedAt: string | null;
  approval: {
    method: string | null;
    voteId: string | null;
    yes: number | null;
    no: number | null;
    abstain: number | null;
    date: string | null;
    note: string;
  };
  /// Live tally of the linked in-app vote, when there is one.
  liveVote: { started: boolean; ended: boolean; yes: number; no: number; abstain: number } | null;
  createdAt: string | null;
}

async function committeeNames(ids: any[]): Promise<Map<string, string>> {
  const rows = await Committee.find({ _id: { $in: ids.filter(Boolean) } }).select("name").lean<any[]>();
  return new Map(rows.map((c) => [String(c._id), c.name]));
}

/// Tally an Election-type vote the way the vote screen does: invalidated
/// ballots out, one choice per voter (their last), abstain counted apart.
export function tallyBudgetVote(vote: any): { yes: number; no: number; abstain: number } {
  const invalid = new Set<string>(vote?.invalidatedBallots ?? []);
  const last = new Map<string, string>();
  for (const v of vote?.votes ?? []) {
    if (!v?.clerkId || invalid.has(v.clerkId)) continue;
    last.set(v.clerkId, String(v.choice ?? ""));
  }
  let yes = 0, no = 0, abstain = 0;
  for (const choice of last.values()) {
    if (choice === VOTE_YES) yes++;
    else if (choice === VOTE_NO) no++;
    else abstain++;
  }
  return { yes, no, abstain };
}

export async function serializePackage(pkg: any): Promise<PackageDTO> {
  const names = await committeeNames([
    ...(pkg.items ?? []).map((i: any) => i.committeeId),
    pkg.amendment?.committeeId,
  ]);
  let liveVote: PackageDTO["liveVote"] = null;
  if (pkg.approval?.voteId && pkg.status === "voting") {
    const vote = await Vote.findById(pkg.approval.voteId).lean<any>();
    if (vote) liveVote = { started: Boolean(vote.started), ended: Boolean(vote.ended), ...tallyBudgetVote(vote) };
  }
  const input = {
    totalCents: pkg.totalCents,
    expectedIncomeCents: pkg.expectedIncomeCents,
    carryoverCents: pkg.carryoverCents,
    activeCount: pkg.activeCount,
  };
  const dues = pkg.finalDuesCents ?? pkg.suggestedDuesCents;
  return {
    _id: String(pkg._id),
    term: pkg.term,
    kind: pkg.kind,
    status: pkg.status,
    title: pkg.title ?? "",
    items: (pkg.items ?? []).map((i: any) => ({
      proposalId: String(i.proposalId),
      committeeId: i.committeeId ? String(i.committeeId) : null,
      committeeName: i.committeeId ? names.get(String(i.committeeId)) ?? "Committee" : "Chapter costs",
      version: i.version,
      totalCents: i.totalCents,
      expectedIncomeCents: i.expectedIncomeCents ?? 0,
      applied: Boolean(i.applied),
    })),
    amendment:
      pkg.kind === "amendment" && pkg.amendment
        ? {
            committeeId: pkg.amendment.committeeId ? String(pkg.amendment.committeeId) : null,
            committeeName: names.get(String(pkg.amendment.committeeId)) ?? "Committee",
            budgetId: pkg.amendment.budgetId ? String(pkg.amendment.budgetId) : null,
            lineId: pkg.amendment.lineId ? String(pkg.amendment.lineId) : null,
            amountCents: pkg.amendment.amountCents ?? 0,
            reason: pkg.amendment.reason ?? "",
            applied: Boolean(pkg.amendment.applied),
          }
        : null,
    totalCents: pkg.totalCents ?? 0,
    expectedIncomeCents: pkg.expectedIncomeCents ?? 0,
    carryoverCents: pkg.carryoverCents ?? 0,
    activeCount: pkg.activeCount ?? 0,
    suggestedDuesCents: pkg.suggestedDuesCents ?? null,
    finalDuesCents: pkg.finalDuesCents ?? null,
    coverageCents: pkg.kind === "term" && dues !== null && dues !== undefined ? duesCoverageCents(input, dues) : null,
    duesAssignedAt: pkg.duesAssignedAt ? new Date(pkg.duesAssignedAt).toISOString() : null,
    approval: {
      method: pkg.approval?.method ?? null,
      voteId: pkg.approval?.voteId ? String(pkg.approval.voteId) : null,
      yes: pkg.approval?.yes ?? null,
      no: pkg.approval?.no ?? null,
      abstain: pkg.approval?.abstain ?? null,
      date: pkg.approval?.date ? new Date(pkg.approval.date).toISOString() : null,
      note: pkg.approval?.note ?? "",
    },
    liveVote,
    createdAt: pkg.createdAt ? new Date(pkg.createdAt).toISOString() : null,
  };
}

export async function listPackages(term: string): Promise<PackageDTO[]> {
  const rows = await BudgetPackage.find({ term }).sort({ createdAt: -1 }).lean<any[]>();
  return Promise.all(rows.map(serializePackage));
}

async function loadPackage(id: any) {
  if (!isObjectId(id)) throw new BudgetHttpError(400, "Invalid package");
  const pkg = await BudgetPackage.findById(id).lean<any>();
  if (!pkg) throw new BudgetHttpError(404, "Package not found");
  return pkg;
}

/// Money carried into `term` from the previous term's close.
export async function carryoverInto(term: string): Promise<number> {
  const rows = await BudgetEntry.find({ kind: "rollover", term, "to.budgetId": { $ne: null } })
    .select("_id amountCents")
    .lean<any[]>();
  if (!rows.length) return 0;
  const reversed = await BudgetEntry.find({ reversesEntryId: { $in: rows.map((r) => r._id) } }).select("reversesEntryId").lean<any[]>();
  const gone = new Set(reversed.map((r) => String(r.reversesEntryId)));
  return rows.filter((r) => !gone.has(String(r._id))).reduce((s, r) => s + r.amountCents, 0);
}

export interface CreatePackageInput {
  term: string;
  kind: "term" | "single" | "amendment";
  title?: string;
  /// "single": the committee whose proposal goes alone.
  committeeId?: any;
  /// "amendment": where the money goes and why.
  amountCents?: any;
  lineId?: any;
  reason?: string;
}

export async function createPackage(viewer: BudgetViewer, input: CreatePackageInput): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const term = input.term;
  const open = await BudgetPackage.exists({ term, status: { $in: ["draft", "voting"] }, kind: input.kind === "term" ? "term" : input.kind });
  if (open && input.kind === "term") {
    throw new BudgetHttpError(409, `There's already an open ${term} package. Finish or cancel it first.`);
  }

  let items: any[] = [];
  let amendment: any = null;
  let title = String(input.title ?? "").trim();

  if (input.kind === "amendment") {
    if (!isObjectId(input.committeeId)) throw new BudgetHttpError(400, "Pick a committee");
    const budget = await loadBudget(input.committeeId, term);
    if (!budget) throw new BudgetHttpError(409, "That committee has no budget this term yet");
    if (budget.status !== "open") throw new BudgetHttpError(409, "That budget is closed");
    const amount = Number(input.amountCents);
    if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount <= 0) {
      throw new BudgetHttpError(400, "Amount must be a whole number of cents above zero");
    }
    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new BudgetHttpError(400, "Say what the money is for");
    const lineId = input.lineId && isObjectId(input.lineId) ? input.lineId : null;
    if (lineId && !(budget.lines ?? []).some((l: any) => String(l._id) === String(lineId) && !l.archived)) {
      throw new BudgetHttpError(400, "That line isn't on this budget");
    }
    amendment = { committeeId: budget.committeeId, budgetId: budget._id, lineId, amountCents: amount, reason: reason.slice(0, 1000) };
    const name = (await committeeNames([budget.committeeId])).get(String(budget.committeeId));
    title ||= `${formatBudgetCents(amount)} more for ${name}`;
  } else {
    const filter: any = { term, status: "submitted" };
    if (input.kind === "single") {
      if (!isObjectId(input.committeeId)) throw new BudgetHttpError(400, "Pick a committee");
      filter.committeeId = input.committeeId;
    }
    const proposals = await BudgetProposal.find(filter).lean<any[]>();
    if (!proposals.length) {
      throw new BudgetHttpError(409, input.kind === "single" ? "That committee has no submitted proposal" : "No submitted proposals to put to a vote");
    }
    // A proposal already in another open package can't be in two votes.
    const taken = await BudgetPackage.find({ status: { $in: ["draft", "voting"] }, "items.proposalId": { $in: proposals.map((p) => p._id) } })
      .select("items.proposalId")
      .lean<any[]>();
    const takenIds = new Set(taken.flatMap((p) => p.items.map((i: any) => String(i.proposalId))));
    items = proposals
      .filter((p) => !takenIds.has(String(p._id)))
      .map((p) => ({
        proposalId: p._id,
        committeeId: p.committeeId ?? null,
        version: p.version,
        totalCents: proposalTotalCents(p.lines ?? []),
        expectedIncomeCents: p.expectedIncomeCents ?? 0,
      }));
    if (!items.length) throw new BudgetHttpError(409, "Every submitted proposal is already in an open package");
    if (input.kind === "single") {
      const name = (await committeeNames([input.committeeId])).get(String(input.committeeId));
      title ||= `${name} ${term} budget`;
    } else {
      title ||= `${term} budget`;
    }
  }

  const totalCents = amendment ? amendment.amountCents : items.reduce((s, i) => s + i.totalCents, 0);
  const expectedIncomeCents = items.reduce((s, i) => s + i.expectedIncomeCents, 0);
  const carryoverCents = input.kind === "term" ? await carryoverInto(term) : 0;
  const activeCount = await Member.countDocuments({ status: "Active" });
  const suggestedDuesCents =
    input.kind === "term" ? suggestDuesCents({ totalCents, expectedIncomeCents, carryoverCents, activeCount }) : null;

  const pkg = await BudgetPackage.create({
    term,
    kind: input.kind,
    status: "draft",
    title: title.slice(0, 120),
    items,
    amendment,
    totalCents,
    expectedIncomeCents,
    carryoverCents,
    activeCount,
    suggestedDuesCents,
    createdBy: viewer._id,
  });

  const events: any[] = [
    {
      term,
      committeeId: amendment?.committeeId ?? (input.kind === "single" ? items[0]?.committeeId : null),
      actorId: viewer._id,
      type: input.kind === "amendment" ? "amendment_proposed" : "package_created",
      amountCents: totalCents,
      summary:
        input.kind === "amendment"
          ? `Proposed an amendment: ${title}. ${amendment.reason}`
          : `Built "${title}" from ${items.length} proposal${items.length === 1 ? "" : "s"}, ${formatBudgetCents(totalCents)} in total`,
      refs: { packageId: pkg._id },
      meta: { items: items.map((i) => ({ proposalId: String(i.proposalId), version: i.version, totalCents: i.totalCents })) },
    },
  ];
  if (suggestedDuesCents !== null) {
    events.push({
      term,
      actorId: null,
      type: "dues_suggested",
      amountCents: suggestedDuesCents,
      summary: `Suggested ${formatBudgetCents(suggestedDuesCents)} dues across ${activeCount} actives (${formatBudgetCents(totalCents)} budget, ${formatBudgetCents(expectedIncomeCents)} expected income, ${formatBudgetCents(carryoverCents)} carried over)`,
      refs: { packageId: pkg._id },
    });
  }
  await recordBudgetEvents(events);
  return serializePackage(pkg.toObject());
}

/// Put a draft package to an in-app vote. Creates an Election vote with Yes
/// and No; E-Council starts and ends it from the normal vote screen.
export async function openAppVote(viewer: BudgetViewer, packageId: any): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.status !== "draft") throw new BudgetHttpError(409, "Only a draft package can be put to a vote");
  const vote = await Vote.create({
    type: "Election",
    title: pkg.title || `${pkg.term} budget`,
    options: [VOTE_YES, VOTE_NO],
    started: false,
    ended: false,
    endTime: null,
    votes: [],
    removedOptions: [],
    proxyRequests: [],
    createdAt: new Date(),
  });
  const updated = await BudgetPackage.findOneAndUpdate(
    { _id: pkg._id, status: "draft" },
    { $set: { status: "voting", "approval.method": "app", "approval.voteId": vote._id } },
    { new: true }
  ).lean<any>();
  if (!updated) {
    await Vote.deleteOne({ _id: vote._id });
    throw new BudgetHttpError(409, "This package changed. Reload and try again.");
  }
  await recordBudgetEvent({
    term: pkg.term,
    committeeId: pkg.amendment?.committeeId ?? null,
    actorId: viewer._id,
    type: "vote_opened",
    amountCents: pkg.totalCents,
    summary: `Put "${pkg.title}" to a chapter vote`,
    refs: { packageId: pkg._id, voteId: vote._id },
  });
  return serializePackage(updated);
}

/// Back out of a vote that hasn't produced a result. The in-app vote is
/// deleted only if nobody has voted yet; otherwise it is left for the record.
export async function cancelVote(viewer: BudgetViewer, packageId: any): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.status !== "voting") throw new BudgetHttpError(409, "This package isn't being voted on");
  const voteId = pkg.approval?.voteId;
  if (voteId) {
    const vote = await Vote.findById(voteId).select("votes started").lean<any>();
    if (vote && !vote.started && !(vote.votes ?? []).length) await Vote.deleteOne({ _id: voteId });
  }
  const updated = await BudgetPackage.findOneAndUpdate(
    { _id: pkg._id, status: "voting" },
    { $set: { status: "draft", "approval.method": null, "approval.voteId": null } },
    { new: true }
  ).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This package changed. Reload and try again.");
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "vote_cancelled",
    summary: `Cancelled the vote on "${pkg.title}"`,
    refs: { packageId: pkg._id, voteId },
  });
  return serializePackage(updated);
}

export async function cancelPackage(viewer: BudgetViewer, packageId: any): Promise<void> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.status !== "draft") throw new BudgetHttpError(409, "Only a draft package can be discarded");
  await BudgetPackage.updateOne({ _id: pkg._id, status: "draft" }, { $set: { status: "rejected", "approval.note": "Discarded before a vote" } });
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "package_cancelled",
    summary: `Discarded "${pkg.title}" before a vote`,
    refs: { packageId: pkg._id },
  });
}

/// Use the result of the linked in-app vote. The vote must have ended.
export async function useAppVoteResult(viewer: BudgetViewer, packageId: any): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.status !== "voting" || pkg.approval?.method !== "app") {
    throw new BudgetHttpError(409, "This package isn't waiting on an in-app vote");
  }
  const vote = await Vote.findById(pkg.approval.voteId).lean<any>();
  if (!vote) throw new BudgetHttpError(404, "The vote is gone. Record the result by hand instead.");
  if (!vote.ended) throw new BudgetHttpError(409, "End the vote first");
  const tally = tallyBudgetVote(vote);
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "vote_closed",
    summary: `Chapter vote on "${pkg.title}": ${tally.yes} yes, ${tally.no} no, ${tally.abstain} abstain`,
    refs: { packageId: pkg._id, voteId: vote._id },
    meta: tally,
  });
  return decide(viewer, pkg, { method: "app", ...tally, date: vote.endedAt ?? new Date(), note: "" });
}

/// Record a vote taken at chapter without the app.
export async function recordVoteResult(
  viewer: BudgetViewer,
  packageId: any,
  input: { yes: any; no: any; abstain?: any; date?: any; note?: string }
): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.status !== "draft" && pkg.status !== "voting") {
    throw new BudgetHttpError(409, "This package already has a result");
  }
  const count = (v: any, label: string) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) throw new BudgetHttpError(400, `${label} must be a whole number`);
    return n;
  };
  const yes = count(input.yes, "Yes"), no = count(input.no, "No"), abstain = count(input.abstain, "Abstain");
  if (yes + no + abstain === 0) throw new BudgetHttpError(400, "Enter the vote count");
  const date = input.date ? calendarDayAtPhoenixNoon(input.date) ?? new Date(NaN) : new Date();
  if (Number.isNaN(date.getTime())) throw new BudgetHttpError(400, "Invalid vote date");
  const note = String(input.note ?? "").trim().slice(0, 1000);
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "vote_recorded",
    summary: `Recorded a chapter vote on "${pkg.title}" from ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" })}: ${yes} yes, ${no} no, ${abstain} abstain` + (note ? `. ${note}` : ""),
    refs: { packageId: pkg._id },
    meta: { yes, no, abstain },
  });
  return decide(viewer, pkg, { method: "recorded", yes, no, abstain, date, note });
}

async function decide(
  viewer: BudgetViewer,
  pkg: any,
  result: { method: "app" | "recorded"; yes: number; no: number; abstain: number; date: Date; note: string }
): Promise<PackageDTO> {
  const carries = voteCarries(result.yes, result.no);
  const updated = await BudgetPackage.findOneAndUpdate(
    { _id: pkg._id, status: pkg.status },
    {
      $set: {
        status: carries ? "approved" : "rejected",
        "approval.method": result.method,
        "approval.yes": result.yes,
        "approval.no": result.no,
        "approval.abstain": result.abstain,
        "approval.date": result.date,
        "approval.recordedBy": viewer._id,
        "approval.note": result.note,
      },
    },
    { new: true }
  ).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This package changed. Reload and try again.");

  await recordBudgetEvent({
    term: pkg.term,
    committeeId: pkg.amendment?.committeeId ?? null,
    actorId: viewer._id,
    type: carries ? (pkg.kind === "amendment" ? "amendment_approved" : "package_approved") : "package_rejected",
    amountCents: pkg.totalCents,
    summary: carries
      ? `Chapter approved "${pkg.title}" (${formatBudgetCents(pkg.totalCents)})`
      : `Chapter rejected "${pkg.title}". Proposals stay submitted for another round.`,
    refs: { packageId: pkg._id },
  });

  if (carries) await applyApprovedPackage(viewer._id, updated);
  return serializePackage(await BudgetPackage.findById(pkg._id).lean<any>());
}

/// Turn an approved package into live budgets. Safe to run more than once:
/// each item is marked applied as it lands, and skipped if already applied.
export async function applyApprovedPackage(actorId: any, pkg: any): Promise<void> {
  if (pkg.status !== "approved") return;

  if (pkg.kind === "amendment") {
    if (pkg.amendment?.applied) return;
    const budget = await loadBudgetById(pkg.amendment.budgetId);
    const claimed = await BudgetPackage.findOneAndUpdate(
      { _id: pkg._id, "amendment.applied": false },
      { $set: { "amendment.applied": true } }
    );
    if (!claimed) return;
    const entry = await BudgetEntry.create({
      kind: "adjustment",
      term: budget.term,
      budgetId: budget._id,
      committeeId: budget.committeeId,
      lineId: pkg.amendment.lineId ?? null,
      amountCents: pkg.amendment.amountCents,
      note: `Chapter-approved amendment: ${pkg.amendment.reason}`,
      actorId,
      refs: { packageId: pkg._id },
    });
    await recordBudgetEvent({
      term: budget.term,
      committeeId: budget.committeeId,
      budgetId: budget._id,
      actorId,
      type: "budget_adjusted",
      amountCents: pkg.amendment.amountCents,
      summary: `Added ${formatBudgetCents(pkg.amendment.amountCents)} by chapter vote: ${pkg.amendment.reason}`,
      refs: { entryId: entry._id, packageId: pkg._id, lineId: pkg.amendment.lineId ?? null },
    });
    return;
  }

  for (const item of pkg.items ?? []) {
    if (item.applied) continue;
    // Claim the item first: a second runner sees it applied and moves on.
    const claimed = await BudgetPackage.findOneAndUpdate(
      { _id: pkg._id, items: { $elemMatch: { proposalId: item.proposalId, applied: false } } },
      { $set: { "items.$.applied": true } }
    );
    if (!claimed) continue;

    await BudgetProposal.updateOne({ _id: item.proposalId }, { $set: { status: "approved" } });
    if (!item.committeeId) continue; // chapter costs feed dues, not a committee budget

    const proposal = await BudgetProposal.findById(item.proposalId).lean<any>();
    // The version voted on, not whatever the proposal says now.
    const votedLines =
      proposal.version === item.version
        ? proposal.lines
        : (proposal.history ?? []).find((h: any) => h.version === item.version)?.lines ?? proposal.lines;

    const { budget } = await ensureBudget(item.committeeId, pkg.term, actorId, {
      proposalId: item.proposalId,
      packageId: pkg._id,
    });
    // Lines by name: a budget created at last term's close (for rollover)
    // may already have some.
    const existing = new Map((budget.lines ?? []).map((l: any) => [l.name.toLowerCase(), l]));
    const toAdd = (votedLines ?? []).filter((l: any) => !existing.has(l.name.toLowerCase()));
    const newLines = toAdd.map((l: any) => ({ _id: new mongoose.Types.ObjectId(), name: l.name }));
    await CommitteeBudget.updateOne(
      { _id: budget._id },
      {
        $push: { lines: { $each: newLines } },
        $set: { proposalId: item.proposalId, packageId: pkg._id },
      }
    );
    const lineIdByName = new Map<string, any>([
      ...[...existing.entries()].map(([k, l]: any) => [k, l._id] as [string, any]),
      ...newLines.map((l: any) => [l.name.toLowerCase(), l._id] as [string, any]),
    ]);
    const allocations = (votedLines ?? [])
      .filter((l: any) => l.amountCents > 0)
      .map((l: any) => ({
        kind: "allocation",
        term: pkg.term,
        budgetId: budget._id,
        committeeId: item.committeeId,
        lineId: lineIdByName.get(l.name.toLowerCase()) ?? null,
        amountCents: l.amountCents,
        note: `Chapter-approved ${pkg.term} budget`,
        actorId,
        refs: { packageId: pkg._id, proposalId: item.proposalId },
      }));
    if (allocations.length) await BudgetEntry.insertMany(allocations);
    const total = allocations.reduce((s: number, a: any) => s + a.amountCents, 0);
    await recordBudgetEvent({
      term: pkg.term,
      committeeId: item.committeeId,
      budgetId: budget._id,
      actorId,
      type: "budget_allocated",
      amountCents: total,
      summary: `Allocated the approved ${formatBudgetCents(total)} across ${allocations.length} line${allocations.length === 1 ? "" : "s"}`,
      refs: { packageId: pkg._id, proposalId: item.proposalId },
    });
  }
}

/// The treasurer's dues number. Defaults to the suggestion.
export async function setFinalDues(viewer: BudgetViewer, packageId: any, raw: any): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.kind !== "term") throw new BudgetHttpError(400, "Dues come from the term package");
  if (pkg.duesAssignedAt) throw new BudgetHttpError(409, "Dues are already assigned for this package");
  const cents = Number(raw);
  if (!Number.isFinite(cents) || cents < 0 || Math.round(cents) !== cents) {
    throw new BudgetHttpError(400, "Dues must be a whole number of cents");
  }
  const before = pkg.finalDuesCents ?? pkg.suggestedDuesCents;
  const updated = await BudgetPackage.findOneAndUpdate({ _id: pkg._id }, { $set: { finalDuesCents: cents } }, { new: true }).lean<any>();
  const coverage = duesCoverageCents(pkg, cents);
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "dues_amount_set",
    amountCents: cents,
    summary:
      `Set dues to ${formatBudgetCents(cents)} per active` +
      (before !== null && before !== undefined && before !== cents ? ` (was ${formatBudgetCents(before)})` : "") +
      (coverage >= 0 ? `, covering the budget with ${formatBudgetCents(coverage)} to spare` : `, ${formatBudgetCents(-coverage)} short of the budget`),
    before: { finalDuesCents: before },
    after: { finalDuesCents: cents },
    refs: { packageId: pkg._id },
  });
  return serializePackage(updated);
}

/// Called after the client assigned dues through POST /api/dues. Checks the
/// batch really exists before saying so.
export async function markDuesAssigned(viewer: BudgetViewer, packageId: any, batchId: string): Promise<PackageDTO> {
  requireTreasuryViewer(viewer);
  const pkg = await loadPackage(packageId);
  if (pkg.kind !== "term" || pkg.status !== "approved") throw new BudgetHttpError(409, "Dues follow an approved term package");
  if (pkg.duesAssignedAt) throw new BudgetHttpError(409, "Dues are already marked assigned");
  const charges = await DuesCharge.find({ batchId: String(batchId), term: pkg.term }).select("amountCents").lean<any[]>();
  if (!charges.length) throw new BudgetHttpError(404, "No dues charges found for that batch");
  const updated = await BudgetPackage.findOneAndUpdate(
    { _id: pkg._id, duesAssignedAt: null },
    { $set: { duesAssignedAt: new Date(), duesAssignedBy: viewer._id, finalDuesCents: charges[0].amountCents } },
    { new: true }
  ).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "Dues are already marked assigned");
  await recordBudgetEvent({
    term: pkg.term,
    actorId: viewer._id,
    type: "dues_assigned",
    amountCents: charges.reduce((s, c) => s + c.amountCents, 0),
    summary: `Assigned ${formatBudgetCents(charges[0].amountCents)} dues to ${charges.length} member${charges.length === 1 ? "" : "s"}`,
    refs: { packageId: pkg._id },
    meta: { batchId: String(batchId) },
  });
  return serializePackage(updated);
}
