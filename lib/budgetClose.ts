// lib/budgetClose.ts
// Ending a term: leftover money carried forward or returned, holds released,
// budgets frozen. Plus the audit export and the nightly reconcile.
import BudgetEntry from "@/lib/models/BudgetEntry";
import BudgetEvent from "@/lib/models/BudgetEvent";
import BudgetPackage from "@/lib/models/BudgetPackage";
import CommitteeBudget from "@/lib/models/CommitteeBudget";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import Reimbursement from "@/lib/models/Reimbursement";
import logger from "@/lib/logger";
import { recordBudgetEvent, recordBudgetEvents } from "@/lib/budgetEvents";
import { BudgetHttpError, BudgetViewer, nextTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import { ensureBudget, listBudgets, loadBudgetById, totalsFor } from "@/lib/budgetLedger";
import { applyApprovedPackage } from "@/lib/budgetPackages";
import { headBudgetLink, tellHead } from "@/lib/budgetNotify";
import { formatBudgetCents, leftoverCents, releasableHoldCents } from "@/lib/budgets";

export interface CloseDecision {
  budgetId: string;
  /// How much of the leftover goes into next term's budget. The rest is
  /// returned to the chapter.
  carryCents: number;
}

export interface ClosePreviewRow {
  budgetId: string;
  committeeId: string;
  committeeName: string;
  status: string;
  leftoverCents: number;
  pendingCount: number;
  heldCents: number;
  unpaidCount: number;
}

export async function closePreview(term: string): Promise<{ nextTerm: string; rows: ClosePreviewRow[] }> {
  const budgets = await listBudgets(term);
  const pending = await Reimbursement.aggregate([
    { $match: { term, committeeId: { $ne: null }, status: "pending" } },
    { $group: { _id: "$budgetId", n: { $sum: 1 } } },
  ]);
  const unpaid = await Reimbursement.aggregate([
    { $match: { term, committeeId: { $ne: null }, status: "approved", kind: "claim", "payout.status": "unpaid" } },
    { $group: { _id: "$budgetId", n: { $sum: 1 } } },
  ]);
  const p = new Map(pending.map((x) => [String(x._id), x.n]));
  const u = new Map(unpaid.map((x) => [String(x._id), x.n]));
  return {
    nextTerm: nextTerm(term),
    rows: budgets.map((b) => ({
      budgetId: b._id,
      committeeId: b.committee._id,
      committeeName: b.committee.name,
      status: b.status,
      // Held money is released at close, so it counts as leftover.
      leftoverCents: leftoverCents({ ...b.totals, availableCents: b.totals.availableCents + b.totals.heldCents }),
      pendingCount: p.get(b._id) ?? 0,
      heldCents: b.totals.heldCents,
      unpaidCount: u.get(b._id) ?? 0,
    })),
  };
}

/// Close one budget. Refuses while anything is still waiting on a decision;
/// approved-but-unpaid claims are fine, since paying them doesn't touch the
/// budget.
export async function closeBudget(viewer: BudgetViewer, decision: CloseDecision) {
  requireTreasuryViewer(viewer);
  const budget = await loadBudgetById(decision.budgetId);
  if (budget.status === "closed") return { alreadyClosed: true };
  const pending = await Reimbursement.countDocuments({ budgetId: budget._id, status: "pending" });
  if (pending) throw new BudgetHttpError(409, `Review the ${pending} pending request${pending === 1 ? "" : "s"} first`);

  // Release open holds. Nobody filed against them in time.
  const requests = await Reimbursement.find({ budgetId: budget._id }).lean<any[]>();
  const holds = requests.filter((r) => r.kind === "preapproval" && r.status === "approved");
  for (const hold of holds) {
    const freed = releasableHoldCents(hold, requests);
    const done = await Reimbursement.updateOne({ _id: hold._id, status: "approved" }, { $set: { status: "released" } });
    if (!done.modifiedCount) continue;
    await recordBudgetEvent({
      term: budget.term,
      committeeId: budget.committeeId,
      budgetId: budget._id,
      actorId: null,
      type: "preapproval_released",
      amountCents: freed,
      summary: `Released the unused hold on "${hold.description}" (${formatBudgetCents(freed)}) at term close`,
      refs: { reimbursementId: hold._id },
    });
  }

  const totals = await totalsFor(budget);
  const leftover = leftoverCents(totals);
  const carry = Math.max(0, Math.min(Math.round(Number(decision.carryCents) || 0), leftover));
  const returned = leftover - carry;
  const to = nextTerm(budget.term);
  const committee = await Committee.findById(budget.committeeId).select("name").lean<any>();
  const name = committee?.name ?? "Committee";

  const events: any[] = [];
  if (carry > 0) {
    const { budget: next } = await ensureBudget(budget.committeeId, to, viewer._id);
    const entry = await BudgetEntry.create({
      kind: "rollover",
      term: to,
      from: { budgetId: budget._id, committeeId: budget.committeeId, lineId: null },
      to: { budgetId: next._id, committeeId: budget.committeeId, lineId: null },
      amountCents: carry,
      note: `Carried over from ${budget.term}`,
      actorId: viewer._id,
    });
    events.push(
      {
        term: budget.term,
        committeeId: budget.committeeId,
        budgetId: budget._id,
        actorId: viewer._id,
        type: "rollover_carried",
        amountCents: -carry,
        summary: `Carried ${formatBudgetCents(carry)} into ${to}`,
        refs: { entryId: entry._id },
      },
      {
        term: to,
        committeeId: budget.committeeId,
        budgetId: next._id,
        actorId: viewer._id,
        type: "rollover_carried",
        amountCents: carry,
        summary: `Started with ${formatBudgetCents(carry)} carried over from ${budget.term}`,
        refs: { entryId: entry._id },
      }
    );
  }
  if (returned > 0) {
    const entry = await BudgetEntry.create({
      kind: "rollover",
      term: budget.term,
      from: { budgetId: budget._id, committeeId: budget.committeeId, lineId: null },
      to: null,
      amountCents: returned,
      note: `Returned to the chapter at ${budget.term} close`,
      actorId: viewer._id,
    });
    events.push({
      term: budget.term,
      committeeId: budget.committeeId,
      budgetId: budget._id,
      actorId: viewer._id,
      type: "rollover_returned",
      amountCents: -returned,
      summary: `Returned ${formatBudgetCents(returned)} unspent to the chapter`,
      refs: { entryId: entry._id },
    });
  }

  // Rollover rows first, then the close: if this dies in between, running it
  // again finds nothing left over and just closes.
  await CommitteeBudget.updateOne({ _id: budget._id, status: "open" }, { $set: { status: "closed", closedAt: new Date(), closedBy: viewer._id } });
  events.push({
    term: budget.term,
    committeeId: budget.committeeId,
    budgetId: budget._id,
    actorId: viewer._id,
    type: "budget_closed",
    amountCents: totals.spentCents,
    summary: `Closed ${name}'s ${budget.term} budget: ${formatBudgetCents(totals.spentCents)} spent of ${formatBudgetCents(totals.fundedCents)}`,
  });
  await recordBudgetEvents(events);
  await tellHead(budget.committeeId, {
    event: "budget_closed",
    title: `${budget.term} budget closed`,
    body:
      `Your ${budget.term} budget is closed. ${formatBudgetCents(totals.spentCents)} spent` +
      (carry ? `, ${formatBudgetCents(carry)} carried into ${to}` : "") +
      (returned ? `, ${formatBudgetCents(returned)} returned to the chapter` : "") +
      ".",
    link: headBudgetLink(budget.committeeId),
    actorId: viewer._id,
  });
  return { alreadyClosed: false, carriedCents: carry, returnedCents: returned };
}

// ---------------------------------------------------------------------------
// Export

function csvCell(value: any): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dollarsCell(cents: number | null | undefined) {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

/// Every log line for a term plus a per-committee summary, as CSV.
export async function exportTermCsv(term: string): Promise<string> {
  const [budgets, events] = await Promise.all([
    listBudgets(term),
    BudgetEvent.find({ term }).sort({ occurredAt: 1 }).lean<any[]>(),
  ]);
  const committees = await Committee.find({ _id: { $in: events.map((e) => e.committeeId).filter(Boolean) } }).select("name").lean<any[]>();
  const actors = await Member.find({ _id: { $in: events.map((e) => e.actorId).filter(Boolean) } }).select("fName lName rollNo").lean<any[]>();
  const cName = new Map(committees.map((c) => [String(c._id), c.name]));
  const aName = new Map(actors.map((a) => [String(a._id), `${a.fName} ${a.lName}`]));

  const lines: string[] = [];
  lines.push(`${term} committee budgets`);
  lines.push(["Committee", "Status", "Funded", "Spent", "Held", "Pending", "Available"].join(","));
  for (const b of budgets) {
    lines.push([b.committee.name, b.status, dollarsCell(b.totals.fundedCents), dollarsCell(b.totals.spentCents), dollarsCell(b.totals.heldCents), dollarsCell(b.totals.pendingCents), dollarsCell(b.totals.availableCents)].map(csvCell).join(","));
  }
  lines.push("");
  lines.push("Action log");
  lines.push(["When (UTC)", "Committee", "Who", "Action", "Amount", "Summary"].join(","));
  for (const e of events) {
    lines.push(
      [
        new Date(e.occurredAt).toISOString(),
        e.committeeId ? cName.get(String(e.committeeId)) ?? "" : "Chapter",
        e.actorId ? aName.get(String(e.actorId)) ?? "" : "System",
        e.type,
        dollarsCell(e.amountCents),
        e.summary,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Reconcile

const REVIEW_EVENT_TYPES = [
  "claim_approved",
  "claim_partially_approved",
  "claim_denied",
  "claim_returned",
  "preapproval_approved",
  "preapproval_denied",
];

/// Runs on the in-process ticker. Without transactions, a crash can land a
/// change without its log line, or an approval without its budgets. This
/// finds both and finishes the job.
export async function reconcileBudgets(now = new Date()) {
  const report = { packagesFinished: 0, reviewGaps: 0, entryGaps: 0 };

  // 1. Approved packages whose budgets weren't all created.
  const unfinished = await BudgetPackage.find({
    status: "approved",
    $or: [{ "items.applied": false }, { kind: "amendment", "amendment.applied": false }],
  }).lean<any[]>();
  for (const pkg of unfinished) {
    try {
      await applyApprovedPackage(pkg.approval?.recordedBy ?? null, pkg);
      report.packagesFinished++;
    } catch (err: any) {
      logger.error({ err, packageId: String(pkg._id) }, "Couldn't finish applying an approved budget package");
    }
  }

  const since = new Date(now.getTime() - 7 * 86400000);

  // 2. Reviewed requests with no review line in the log.
  const reviewed = await Reimbursement.find({ committeeId: { $ne: null }, reviewedAt: { $gte: since } })
    .select("_id term committeeId budgetId status kind amountCents approvedCents description reviewedBy reviewedAt")
    .lean<any[]>();
  if (reviewed.length) {
    const logged = await BudgetEvent.find({ "refs.reimbursementId": { $in: reviewed.map((r) => r._id) }, type: { $in: REVIEW_EVENT_TYPES } })
      .select("refs.reimbursementId")
      .lean<any[]>();
    const have = new Set(logged.map((e) => String(e.refs.reimbursementId)));
    const gaps = reviewed.filter((r) => !have.has(String(r._id)));
    if (gaps.length) {
      await recordBudgetEvents(
        gaps.map((r) => ({
          term: r.term,
          committeeId: r.committeeId,
          budgetId: r.budgetId,
          actorId: r.reviewedBy ?? null,
          type: "audit_gap_repaired" as const,
          occurredAt: r.reviewedAt,
          amountCents: r.approvedCents ?? r.amountCents,
          summary: `Log line restored: "${r.description}" was ${r.status}`,
          refs: { reimbursementId: r._id },
          meta: { status: r.status, kind: r.kind },
        }))
      );
      report.reviewGaps = gaps.length;
    }
  }

  // 3. Money movements with no log line. Package allocations are logged per
  // committee by package, not per entry, so they're matched that way.
  const entries = await BudgetEntry.find({ createdAt: { $gte: since }, "refs.packageId": null })
    .select("_id kind term budgetId committeeId from amountCents actorId occurredAt note")
    .lean<any[]>();
  if (entries.length) {
    const logged = await BudgetEvent.find({ "refs.entryId": { $in: entries.map((e) => e._id) } }).select("refs.entryId").lean<any[]>();
    const have = new Set(logged.map((e) => String(e.refs.entryId)));
    const gaps = entries.filter((e) => !have.has(String(e._id)));
    if (gaps.length) {
      await recordBudgetEvents(
        gaps.map((e) => ({
          term: e.term,
          committeeId: e.committeeId ?? e.from?.committeeId ?? null,
          budgetId: e.budgetId ?? e.from?.budgetId ?? null,
          actorId: e.actorId ?? null,
          type: "audit_gap_repaired" as const,
          occurredAt: e.occurredAt,
          amountCents: e.amountCents,
          summary: `Log line restored: ${e.kind.replace("_", " ")} of ${formatBudgetCents(Math.abs(e.amountCents))}` + (e.note ? `: ${e.note}` : ""),
          refs: { entryId: e._id },
        }))
      );
      report.entryGaps = gaps.length;
    }
  }
  return report;
}
