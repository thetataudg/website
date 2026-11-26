// lib/budgetRequests.ts
// Committee claims (money already spent) and pre-approvals (asking first),
// from the head filing one to the treasurer paying it.
//
// These are `Reimbursement` documents with `committeeId` set. The general
// reimbursement routes refuse them, so they only move through here.
import Reimbursement from "@/lib/models/Reimbursement";
import CommitteeBudget from "@/lib/models/CommitteeBudget";
import Member from "@/lib/models/Member";
import Committee from "@/lib/models/Committee";
import { normalizeDueDate } from "@/lib/dues";
import { REIMBURSEMENT_CATEGORIES } from "@/lib/models/Reimbursement";
import { withViewableReceipts } from "@/lib/reimbursements";
import { mintCredit, applyCreditToOpenCharges } from "@/lib/credit";
import { recordFinanceEvent } from "@/lib/financeEvents";
import { recordBudgetEvent, recordBudgetEvents } from "@/lib/budgetEvents";
import { BudgetHttpError, BudgetViewer, committeeAccess, isObjectId, requireTreasuryViewer } from "@/lib/budgetAuth";
import { loadBudget, loadBudgetById, totalsFor } from "@/lib/budgetLedger";
import { headBudgetLink, tellHead, tellMember, tellTreasurer, TREASURER_BUDGET_LINK } from "@/lib/budgetNotify";
import {
  BudgetTotals,
  canTransition,
  checkOverBudget,
  formatBudgetCents,
  releasableHoldCents,
  thresholdsCrossed,
  validateReview,
} from "@/lib/budgets";

export const PAYOUT_METHODS_MANUAL = ["cash", "venmo", "zelle", "check", "other"] as const;

export interface BudgetRequestDTO {
  _id: string;
  kind: "claim" | "preapproval";
  committeeId: string;
  committeeName: string;
  budgetId: string | null;
  term: string;
  lineId: string | null;
  lineName: string;
  status: string;
  amountCents: number;
  approvedCents: number | null;
  description: string;
  category: string;
  purchasedOn: string | null;
  receiptUrls: string[];
  reviewNote: string;
  reviewedAt: string | null;
  overBudgetOverride: boolean;
  preapprovalId: string | null;
  revision: number;
  submittedBy: { _id: string; name: string; rollNo: string } | null;
  payout: {
    status: string | null;
    method: string | null;
    reference: string;
    paidAt: string | null;
  };
  submittedAt: string | null;
  ageDays: number;
}

function iso(d: any) {
  return d ? new Date(d).toISOString() : null;
}

export async function serializeRequests(rows: any[]): Promise<BudgetRequestDTO[]> {
  const memberIds = [...new Set(rows.map((r) => String(r.submittedBy ?? r.memberId)).filter(Boolean))];
  const [members, committees, budgets] = await Promise.all([
    Member.find({ _id: { $in: memberIds } }).select("fName lName rollNo").lean<any[]>(),
    Committee.find({ _id: { $in: rows.map((r) => r.committeeId) } }).select("name").lean<any[]>(),
    CommitteeBudget.find({ _id: { $in: rows.map((r) => r.budgetId).filter(Boolean) } }).select("lines term").lean<any[]>(),
  ]);
  const memberById = new Map(members.map((m) => [String(m._id), m]));
  const committeeById = new Map(committees.map((c) => [String(c._id), c.name]));
  const budgetById = new Map(budgets.map((b) => [String(b._id), b]));
  const now = Date.now();
  return Promise.all(
    rows.map(async (r) => {
      const who = memberById.get(String(r.submittedBy ?? r.memberId));
      const budget = budgetById.get(String(r.budgetId));
      const line = r.lineId ? (budget?.lines ?? []).find((l: any) => String(l._id) === String(r.lineId)) : null;
      const dto: BudgetRequestDTO = {
        _id: String(r._id),
        kind: r.kind === "preapproval" ? "preapproval" : "claim",
        committeeId: String(r.committeeId),
        committeeName: committeeById.get(String(r.committeeId)) ?? "",
        budgetId: r.budgetId ? String(r.budgetId) : null,
        term: r.term,
        lineId: r.lineId ? String(r.lineId) : null,
        lineName: line?.name ?? "Unassigned",
        status: r.status,
        amountCents: r.amountCents,
        approvedCents: r.approvedCents ?? null,
        description: r.description ?? "",
        category: r.category ?? "other",
        purchasedOn: iso(r.purchasedOn),
        receiptUrls: r.receiptUrls ?? [],
        reviewNote: r.reviewNote ?? "",
        reviewedAt: iso(r.reviewedAt),
        overBudgetOverride: Boolean(r.overBudgetOverride),
        preapprovalId: r.preapprovalId ? String(r.preapprovalId) : null,
        revision: r.revision ?? 0,
        submittedBy: who ? { _id: String(who._id), name: `${who.fName ?? ""} ${who.lName ?? ""}`.trim(), rollNo: who.rollNo ?? "" } : null,
        payout: {
          status: r.payout?.status ?? null,
          method: r.payout?.method ?? null,
          reference: r.payout?.reference ?? "",
          paidAt: iso(r.payout?.paidAt),
        },
        submittedAt: iso(r.createdAt),
        ageDays: r.createdAt ? Math.max(0, Math.floor((now - new Date(r.createdAt).getTime()) / 86400000)) : 0,
      };
      return withViewableReceipts(dto);
    })
  );
}

async function loadRequest(id: any) {
  if (!isObjectId(id)) throw new BudgetHttpError(400, "Invalid request");
  const r = await Reimbursement.findById(id).lean<any>();
  if (!r || !r.committeeId) throw new BudgetHttpError(404, "Request not found");
  return r;
}

function lineOf(budget: any, lineId: any) {
  if (!lineId) return null;
  const line = (budget.lines ?? []).find((l: any) => String(l._id) === String(lineId));
  if (!line) throw new BudgetHttpError(400, "That line isn't on this budget");
  if (line.archived) throw new BudgetHttpError(409, `${line.name} is archived`);
  return line;
}

function lineLabel(budget: any, lineId: any) {
  if (!lineId) return "Unassigned";
  return (budget.lines ?? []).find((l: any) => String(l._id) === String(lineId))?.name ?? "a line";
}

function readFields(body: any, kind: "claim" | "preapproval") {
  const amount = Number(body?.amountCents);
  if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount <= 0) {
    throw new BudgetHttpError(400, "Amount must be a whole number of cents above zero");
  }
  const description = String(body?.description ?? "").trim();
  if (!description) throw new BudgetHttpError(400, kind === "claim" ? "Say what you bought" : "Say what you want to buy");
  const category = REIMBURSEMENT_CATEGORIES.includes(body?.category) ? body.category : "other";
  const receiptUrls: string[] = Array.isArray(body?.receiptUrls) ? body.receiptUrls.map(String).filter(Boolean).slice(0, 10) : [];
  let purchasedOn: Date;
  if (kind === "claim") {
    const parsed = body?.purchasedOn ? normalizeDueDate(body.purchasedOn) : null;
    if (!parsed) throw new BudgetHttpError(400, "When was it bought?");
    if (parsed.getTime() > Date.now() + 86400000) throw new BudgetHttpError(400, "The purchase date can't be in the future");
    if (!receiptUrls.length) throw new BudgetHttpError(400, "Attach the receipt");
    purchasedOn = parsed;
  } else {
    // Pre-approvals are about a future purchase; the field is required by
    // the schema, so it carries the day it was asked.
    purchasedOn = normalizeDueDate(new Date().toISOString().slice(0, 10)) ?? new Date();
  }
  return { amountCents: amount, description: description.slice(0, 500), category, receiptUrls, purchasedOn };
}

async function afterChange(budget: any, before: BudgetTotals) {
  // Thresholds are checked after anything that commits money. Each fires
  // once per budget: the $addToSet claim makes a race send it once.
  const after = await totalsFor(budget);
  const crossed = thresholdsCrossed(before, after, budget.thresholdsNotified ?? []);
  for (const threshold of crossed) {
    const claimed = await CommitteeBudget.findOneAndUpdate(
      { _id: budget._id, thresholdsNotified: { $ne: threshold } },
      { $addToSet: { thresholdsNotified: threshold } }
    );
    if (!claimed) continue;
    const name = (await Committee.findById(budget.committeeId).select("name").lean<any>())?.name ?? "A committee";
    const summary =
      threshold >= 100
        ? `${name} has used its whole ${budget.term} budget`
        : `${name} has used ${threshold}% of its ${budget.term} budget`;
    await recordBudgetEvent({
      term: budget.term,
      committeeId: budget.committeeId,
      budgetId: budget._id,
      actorId: null,
      type: "threshold_crossed",
      amountCents: after.spentCents + after.heldCents,
      summary,
      meta: { threshold },
    });
    const body = `${summary}. ${formatBudgetCents(Math.max(0, after.availableCents))} left.`;
    await Promise.all([
      tellHead(budget.committeeId, { event: "threshold", title: "Budget update", body, link: headBudgetLink(budget.committeeId) }),
      tellTreasurer({ event: "threshold", title: "Budget update", body, link: TREASURER_BUDGET_LINK }),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Head

export interface SubmitInput {
  committeeId: any;
  term: string;
  kind: "claim" | "preapproval";
  lineId?: any;
  preapprovalId?: any;
  amountCents: any;
  description: string;
  category?: string;
  purchasedOn?: string;
  receiptUrls?: string[];
}

export async function submitRequest(viewer: BudgetViewer, input: SubmitInput) {
  const access = await committeeAccess(viewer, input.committeeId);
  if (!access.isHead) throw new BudgetHttpError(403, "Only this committee's head can file against its budget");
  const kind = input.kind === "preapproval" ? "preapproval" : "claim";
  const budget = await loadBudget(access.committee._id, input.term);
  if (!budget) throw new BudgetHttpError(409, `${access.committee.name} has no ${input.term} budget yet`);
  if (budget.status !== "open") throw new BudgetHttpError(409, "This budget is closed");
  const fields = readFields(input, kind);

  let lineId = input.lineId && isObjectId(input.lineId) ? input.lineId : null;
  let preapprovalId: any = null;
  if (kind === "claim" && input.preapprovalId) {
    const pre = await loadRequest(input.preapprovalId);
    if (pre.kind !== "preapproval" || String(pre.budgetId) !== String(budget._id)) {
      throw new BudgetHttpError(400, "That pre-approval isn't on this budget");
    }
    if (pre.status !== "approved") throw new BudgetHttpError(409, "That pre-approval isn't approved and open");
    preapprovalId = pre._id;
    lineId = pre.lineId ?? null; // a claim lands where its pre-approval was held
  }
  lineOf(budget, lineId);

  const totals = await totalsFor(budget);
  const doc = await Reimbursement.create({
    memberId: viewer._id,
    submittedBy: viewer._id,
    term: input.term,
    committeeId: access.committee._id,
    budgetId: budget._id,
    lineId,
    kind,
    preapprovalId,
    ...fields,
    status: "pending",
  });

  const amount = formatBudgetCents(fields.amountCents);
  const summary =
    kind === "claim"
      ? `${viewer.fName} filed a ${amount} claim: ${fields.description}`
      : `${viewer.fName} asked to spend ${amount}: ${fields.description}`;
  await recordBudgetEvent({
    term: input.term,
    committeeId: access.committee._id,
    budgetId: budget._id,
    actorId: viewer._id,
    type: kind === "claim" ? "claim_submitted" : "preapproval_requested",
    amountCents: fields.amountCents,
    summary,
    refs: { reimbursementId: doc._id, lineId, memberId: viewer._id },
  });
  if (kind === "claim") {
    await recordFinanceEvent({
      memberId: viewer._id,
      actorId: viewer._id,
      type: "reimbursement_submitted",
      amountCents: fields.amountCents,
      summary: `Filed a ${amount} ${access.committee.name} claim: ${fields.description}`,
      refs: { reimbursementId: doc._id },
    });
  }
  const releasing = preapprovalId ? releasableHoldCents(await Reimbursement.findById(preapprovalId).lean<any>(), await Reimbursement.find({ budgetId: budget._id }).lean<any[]>()) : 0;
  const check = checkOverBudget(totals, lineId, fields.amountCents, releasing);
  await tellTreasurer({
    event: kind === "claim" ? "claim_submitted" : "preapproval_requested",
    title: `${access.committee.name}: ${kind === "claim" ? "new claim" : "spending request"}`,
    body: summary + (check.needsOverride ? ". This would put the committee over budget." : ""),
    link: TREASURER_BUDGET_LINK,
    amountCents: fields.amountCents,
    refs: { reimbursementId: doc._id },
    actorId: viewer._id,
  });
  const [dto] = await serializeRequests([doc.toObject()]);
  return { request: dto, overBudget: check };
}

export async function editRequest(viewer: BudgetViewer, id: any, body: any) {
  const r = await loadRequest(id);
  const access = await committeeAccess(viewer, r.committeeId);
  if (!access.isHead) throw new BudgetHttpError(403, "Only this committee's head can change its requests");
  if (r.status !== "pending" && r.status !== "returned") throw new BudgetHttpError(409, "This request can't be edited now");
  const budget = await loadBudgetById(r.budgetId);
  if (budget.status !== "open") throw new BudgetHttpError(409, "This budget is closed");
  const kind = r.kind === "preapproval" ? "preapproval" : "claim";
  const fields = readFields(
    {
      amountCents: body?.amountCents ?? r.amountCents,
      description: body?.description ?? r.description,
      category: body?.category ?? r.category,
      purchasedOn: body?.purchasedOn ?? (r.purchasedOn ? new Date(r.purchasedOn).toISOString().slice(0, 10) : undefined),
      receiptUrls: body?.receiptUrls ?? r.receiptUrls,
    },
    kind
  );
  let lineId = r.lineId;
  if (!r.preapprovalId && body && "lineId" in body) {
    lineId = body.lineId && isObjectId(body.lineId) ? body.lineId : null;
    lineOf(budget, lineId);
  }
  const resubmit = r.status === "returned";
  if (resubmit && !canTransition(kind, "returned", "pending", "head")) throw new BudgetHttpError(409, "Can't resubmit");

  const set: any = { ...fields, lineId };
  if (resubmit) {
    set.status = "pending";
    set.revision = (r.revision ?? 0) + 1;
  }
  const updated = await Reimbursement.findOneAndUpdate({ _id: r._id, status: r.status }, { $set: set }, { new: true }).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This request changed. Reload and try again.");

  const before = { amountCents: r.amountCents, description: r.description, lineId: r.lineId ? String(r.lineId) : null, receiptCount: (r.receiptUrls ?? []).length };
  const after = { amountCents: updated.amountCents, description: updated.description, lineId: updated.lineId ? String(updated.lineId) : null, receiptCount: (updated.receiptUrls ?? []).length };
  const newReceipts = after.receiptCount > before.receiptCount;
  await recordBudgetEvents([
    {
      term: r.term,
      committeeId: r.committeeId,
      budgetId: r.budgetId,
      actorId: viewer._id,
      type: resubmit ? "claim_resubmitted" : "claim_edited",
      amountCents: updated.amountCents,
      summary: `${resubmit ? "Resubmitted" : "Edited"} ${kind === "claim" ? "claim" : "spending request"} "${updated.description}" at ${formatBudgetCents(updated.amountCents)}`,
      before,
      after,
      refs: { reimbursementId: r._id },
      meta: { kind },
    },
    ...(newReceipts
      ? [{
          term: r.term,
          committeeId: r.committeeId,
          budgetId: r.budgetId,
          actorId: viewer._id,
          type: "receipt_added" as const,
          summary: `Added ${after.receiptCount - before.receiptCount} receipt${after.receiptCount - before.receiptCount === 1 ? "" : "s"} to "${updated.description}"`,
          refs: { reimbursementId: r._id },
        }]
      : []),
  ]);
  if (resubmit) {
    await tellTreasurer({
      event: "claim_resubmitted",
      title: `${access.committee.name}: request resubmitted`,
      body: `${viewer.fName} resubmitted "${updated.description}" at ${formatBudgetCents(updated.amountCents)}`,
      link: TREASURER_BUDGET_LINK,
      refs: { reimbursementId: r._id },
      actorId: viewer._id,
    });
  }
  const [dto] = await serializeRequests([updated]);
  return dto;
}

/// Head withdraws a pending request, or releases an approved hold.
/// The treasury may release a hold too.
export async function withdrawOrRelease(viewer: BudgetViewer, id: any, action: "withdraw" | "release", note = "") {
  const r = await loadRequest(id);
  const access = await committeeAccess(viewer, r.committeeId);
  const kind = r.kind === "preapproval" ? "preapproval" : "claim";
  const to = action === "withdraw" ? "withdrawn" : "released";
  const as = access.isHead ? "head" : "treasurer";
  if (!canTransition(kind, r.status, to, as)) {
    throw new BudgetHttpError(409, action === "withdraw" ? "Only a pending request can be withdrawn" : "Only an approved spending request can be released");
  }
  const updated = await Reimbursement.findOneAndUpdate({ _id: r._id, status: r.status }, { $set: { status: to } }, { new: true }).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This request changed. Reload and try again.");
  const freed = action === "release" ? releasableHoldCents(r, await Reimbursement.find({ budgetId: r.budgetId }).lean<any[]>()) : 0;
  await recordBudgetEvent({
    term: r.term,
    committeeId: r.committeeId,
    budgetId: r.budgetId,
    actorId: viewer._id,
    type: action === "withdraw" ? "claim_withdrawn" : "preapproval_released",
    amountCents: action === "withdraw" ? r.amountCents : freed,
    summary:
      action === "withdraw"
        ? `Withdrew "${r.description}" (${formatBudgetCents(r.amountCents)})`
        : `Released the hold on "${r.description}", freeing ${formatBudgetCents(freed)}` + (note ? `: ${note}` : ""),
    before: { status: r.status },
    after: { status: to },
    refs: { reimbursementId: r._id },
  });
  if (action === "release" && !access.isHead) {
    await tellHead(r.committeeId, {
      event: "preapproval_released",
      title: "Hold released",
      body: `The treasurer released the hold on "${r.description}"` + (note ? `: ${note}` : ""),
      link: headBudgetLink(r.committeeId),
      actorId: viewer._id,
    });
  }
  const [dto] = await serializeRequests([updated]);
  return dto;
}

// ---------------------------------------------------------------------------
// Treasurer

export async function reviewRequest(
  viewer: BudgetViewer,
  id: any,
  body: { action: "approve" | "deny" | "return"; approvedCents?: any; note?: string; overrideConfirmed?: boolean }
) {
  requireTreasuryViewer(viewer);
  const r = await loadRequest(id);
  const kind = r.kind === "preapproval" ? "preapproval" : "claim";
  const target = body.action === "approve" ? "approved" : body.action === "deny" ? "denied" : "returned";
  if (!canTransition(kind, r.status, target, "treasurer")) throw new BudgetHttpError(409, `This request is ${r.status}`);
  const budget = await loadBudgetById(r.budgetId);
  if (budget.status !== "open") throw new BudgetHttpError(409, "This budget is closed");

  const requests = await Reimbursement.find({ budgetId: budget._id }).lean<any[]>();
  const before = await totalsFor(budget);
  const pre = r.preapprovalId ? requests.find((x) => String(x._id) === String(r.preapprovalId)) : null;
  const approvedCents =
    body.approvedCents === undefined || body.approvedCents === null || body.approvedCents === "" ? r.amountCents : Number(body.approvedCents);
  const check = body.action === "approve" ? checkOverBudget(before, r.lineId, approvedCents, releasableHoldCents(pre, requests)) : null;
  const outcome = validateReview(
    { action: body.action, requestedCents: r.amountCents, approvedCents, note: body.note, overrideConfirmed: Boolean(body.overrideConfirmed) },
    check
  );
  if (!outcome.ok) throw new BudgetHttpError(400, outcome.error ?? "Can't do that");

  const note = String(body.note ?? "").trim().slice(0, 2000);
  const set: any = {
    status: outcome.status,
    reviewedBy: viewer._id,
    reviewedAt: new Date(),
    reviewNote: note,
  };
  if (outcome.status === "approved") {
    set.approvedCents = outcome.approvedCents;
    set.overBudgetOverride = Boolean(check?.needsOverride);
    if (kind === "claim") set.payout = { status: "unpaid", method: null, reference: "", proofUrl: "", paidAt: null, paidBy: null, creditEntryId: null };
  }
  const updated = await Reimbursement.findOneAndUpdate({ _id: r._id, status: r.status }, { $set: set }, { new: true }).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This request changed. Reload and try again.");

  // A claim against a pre-approval closes the pre-approval out.
  if (outcome.status === "approved" && pre && pre.status === "approved") {
    await Reimbursement.updateOne({ _id: pre._id, status: "approved" }, { $set: { status: "fulfilled" } });
  }

  const amount = formatBudgetCents(r.amountCents);
  const approved = outcome.approvedCents ? formatBudgetCents(outcome.approvedCents) : "";
  const what = `"${r.description}"`;
  let type: any;
  let summary: string;
  if (outcome.status === "approved") {
    type = kind === "claim" ? (outcome.partial ? "claim_partially_approved" : "claim_approved") : "preapproval_approved";
    summary = outcome.partial
      ? `Approved ${approved} of ${amount} for ${what}: ${note}`
      : `Approved ${approved} for ${what}`;
  } else if (outcome.status === "denied") {
    type = kind === "claim" ? "claim_denied" : "preapproval_denied";
    summary = `Denied ${what} (${amount}): ${note}`;
  } else {
    type = "claim_returned";
    summary = `Sent ${what} back: ${note}`;
  }
  const events: any[] = [
    {
      term: r.term,
      committeeId: r.committeeId,
      budgetId: r.budgetId,
      actorId: viewer._id,
      type,
      amountCents: outcome.approvedCents ?? r.amountCents,
      summary,
      before: { status: r.status, amountCents: r.amountCents },
      after: { status: outcome.status, approvedCents: outcome.approvedCents ?? null },
      refs: { reimbursementId: r._id, lineId: r.lineId, memberId: r.memberId },
      meta: { kind, partial: outcome.partial ?? false },
    },
  ];
  if (check?.needsOverride) {
    events.push({
      term: r.term,
      committeeId: r.committeeId,
      budgetId: r.budgetId,
      actorId: viewer._id,
      type: "over_budget_override",
      amountCents: check.committeeShortCents,
      summary: `Approved over budget: the committee is now ${formatBudgetCents(check.committeeShortCents)} over`,
      refs: { reimbursementId: r._id },
    });
  }
  await recordBudgetEvents(events);
  if (kind === "claim" && outcome.status !== "returned") {
    await recordFinanceEvent({
      memberId: r.memberId,
      actorId: viewer._id,
      type: outcome.status === "approved" ? "reimbursement_approved" : "reimbursement_denied",
      amountCents: outcome.approvedCents ?? r.amountCents,
      summary,
      refs: { reimbursementId: r._id },
      meta: { committeeId: String(r.committeeId) },
    });
  }

  const titles: Record<string, string> = { approved: "Request approved", denied: "Request denied", returned: "Request sent back" };
  await tellHead(r.committeeId, {
    event: type,
    title: titles[outcome.status!],
    body: summary + (outcome.status === "approved" && kind === "claim" ? ". Payment comes next." : ""),
    link: headBudgetLink(r.committeeId),
    amountCents: outcome.approvedCents ?? r.amountCents,
    refs: { reimbursementId: r._id },
    actorId: viewer._id,
  });
  if (outcome.status === "approved") await afterChange(budget, before);

  const [dto] = await serializeRequests([updated]);
  return dto;
}

/// Move a request to a different committee or line, for one filed in the
/// wrong place. Pending or approved; approved spending moves with it, so the
/// receiving side is checked like a fresh approval.
export async function retagRequest(
  viewer: BudgetViewer,
  id: any,
  body: { committeeId?: any; lineId?: any; note?: string; overrideConfirmed?: boolean }
) {
  requireTreasuryViewer(viewer);
  const r = await loadRequest(id);
  if (!["pending", "approved", "returned"].includes(r.status)) throw new BudgetHttpError(409, `A ${r.status} request can't be moved`);
  if (r.preapprovalId) throw new BudgetHttpError(409, "This claim is tied to a pre-approval. Move the pre-approval's line instead.");
  if (r.kind === "preapproval" && (await Reimbursement.exists({ preapprovalId: r._id, status: { $in: ["pending", "approved"] } }))) {
    throw new BudgetHttpError(409, "A claim has been filed against this pre-approval");
  }
  const note = String(body.note ?? "").trim();
  if (!note) throw new BudgetHttpError(400, "Say why it's being moved");
  const fromBudget = await loadBudgetById(r.budgetId);
  const toCommitteeId = body.committeeId && isObjectId(body.committeeId) ? body.committeeId : r.committeeId;
  const toBudget = String(toCommitteeId) === String(r.committeeId) ? fromBudget : await loadBudget(toCommitteeId, r.term);
  if (!toBudget) throw new BudgetHttpError(409, "That committee has no budget this term");
  if (fromBudget.status !== "open" || toBudget.status !== "open") throw new BudgetHttpError(409, "Both budgets must be open");
  const toLineId = body.lineId && isObjectId(body.lineId) ? body.lineId : null;
  lineOf(toBudget, toLineId);
  if (String(toBudget._id) === String(fromBudget._id) && String(toLineId ?? "") === String(r.lineId ?? "")) {
    throw new BudgetHttpError(400, "It's already there");
  }

  const committed = r.status === "approved" ? (r.kind === "preapproval" ? releasableHoldCents(r, await Reimbursement.find({ budgetId: r.budgetId }).lean<any[]>()) : r.approvedCents ?? 0) : 0;
  let toBefore: BudgetTotals | null = null;
  if (committed > 0) {
    toBefore = await totalsFor(toBudget);
    const sameBudget = String(toBudget._id) === String(fromBudget._id);
    // Moving within one budget leaves the committee total unchanged.
    const check = checkOverBudget(toBefore, toLineId, committed, sameBudget ? committed : 0);
    if (check.needsOverride && !body.overrideConfirmed) {
      throw new BudgetHttpError(400, "This takes the receiving committee over budget and needs an override");
    }
  }
  const updated = await Reimbursement.findOneAndUpdate(
    { _id: r._id, status: r.status, budgetId: r.budgetId },
    { $set: { committeeId: toBudget.committeeId, budgetId: toBudget._id, lineId: toLineId } },
    { new: true }
  ).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This request changed. Reload and try again.");

  const [fromName, toName] = await Promise.all([
    Committee.findById(fromBudget.committeeId).select("name").lean<any>(),
    Committee.findById(toBudget.committeeId).select("name").lean<any>(),
  ]);
  const where = (b: any, c: any, l: any) => `${c?.name ?? "committee"} / ${lineLabel(b, l)}`;
  const summary = `Moved "${r.description}" from ${where(fromBudget, fromName, r.lineId)} to ${where(toBudget, toName, toLineId)}: ${note}`;
  const sides = String(toBudget._id) === String(fromBudget._id) ? [fromBudget] : [fromBudget, toBudget];
  await recordBudgetEvents(
    sides.map((b) => ({
      term: r.term,
      committeeId: b.committeeId,
      budgetId: b._id,
      actorId: viewer._id,
      type: "expense_retagged" as const,
      amountCents: committed || r.amountCents,
      summary,
      before: { committeeId: String(fromBudget.committeeId), budgetId: String(fromBudget._id), lineId: r.lineId ? String(r.lineId) : null },
      after: { committeeId: String(toBudget.committeeId), budgetId: String(toBudget._id), lineId: toLineId ? String(toLineId) : null },
      refs: { reimbursementId: r._id, otherCommitteeId: b === fromBudget ? toBudget.committeeId : fromBudget.committeeId },
    }))
  );
  for (const b of sides) {
    await tellHead(b.committeeId, { event: "expense_retagged", title: "Request moved", body: summary, link: headBudgetLink(b.committeeId), actorId: viewer._id, quiet: true });
  }
  if (toBefore) await afterChange(toBudget, toBefore);
  const [dto] = await serializeRequests([updated]);
  return dto;
}

/// Pay an approved claim: by hand (cash, Venmo, Zelle, check) or as dues
/// credit. The claim is marked paid before credit is minted, so a double
/// click can only ever pay once.
export async function payRequest(
  viewer: BudgetViewer,
  id: any,
  body: { method: string; reference?: string; proofUrl?: string; note?: string }
) {
  requireTreasuryViewer(viewer);
  const r = await loadRequest(id);
  if (r.kind === "preapproval") throw new BudgetHttpError(400, "Pre-approvals aren't paid. The claim filed against one is.");
  if (r.status !== "approved") throw new BudgetHttpError(409, "Only an approved claim can be paid");
  if (r.payout?.status === "paid") throw new BudgetHttpError(409, "This claim is already paid");
  const method = String(body.method ?? "");
  if (method !== "credit" && !(PAYOUT_METHODS_MANUAL as readonly string[]).includes(method)) {
    throw new BudgetHttpError(400, "Pick how it was paid");
  }
  const amount = r.approvedCents ?? r.amountCents;
  const reference = String(body.reference ?? "").trim().slice(0, 200);
  const paidAt = new Date();
  const updated = await Reimbursement.findOneAndUpdate(
    { _id: r._id, status: "approved", "payout.status": { $ne: "paid" } },
    {
      $set: {
        "payout.status": "paid",
        "payout.method": method,
        "payout.reference": reference,
        "payout.proofUrl": String(body.proofUrl ?? "").slice(0, 500),
        "payout.paidAt": paidAt,
        "payout.paidBy": viewer._id,
      },
    },
    { new: true }
  ).lean<any>();
  if (!updated) throw new BudgetHttpError(409, "This claim is already paid");

  const committee = await Committee.findById(r.committeeId).select("name").lean<any>();
  let appliedCents = 0;
  let summary: string;
  if (method === "credit") {
    const entry = await mintCredit({ memberId: r.memberId, amountCents: amount, actorId: viewer._id, reimbursementId: r._id, note: `${committee?.name ?? "Committee"} claim paid as credit` });
    await Reimbursement.updateOne({ _id: r._id }, { $set: { "payout.creditEntryId": entry._id, creditEntryId: entry._id } });
    const application = await applyCreditToOpenCharges(r.memberId, viewer._id);
    appliedCents = application.appliedCents;
    summary = `Paid ${formatBudgetCents(amount)} for "${r.description}" as dues credit` + (appliedCents ? `, ${formatBudgetCents(appliedCents)} applied to dues` : "");
    await recordFinanceEvent({
      memberId: r.memberId,
      actorId: viewer._id,
      type: "credit_adjusted",
      amountCents: amount,
      summary: `${committee?.name ?? "Committee"} claim "${r.description}" paid as ${formatBudgetCents(amount)} credit`,
      refs: { reimbursementId: r._id, creditEntryId: entry._id },
      meta: { source: "committee_claim" },
    });
  } else {
    summary = `Paid ${formatBudgetCents(amount)} for "${r.description}" by ${method}` + (reference ? ` (${reference})` : "");
    await recordFinanceEvent({
      memberId: r.memberId,
      actorId: viewer._id,
      type: "credit_paid_out",
      amountCents: -amount,
      summary: `${committee?.name ?? "Committee"} claim "${r.description}" paid ${formatBudgetCents(amount)} by ${method}`,
      refs: { reimbursementId: r._id },
      meta: { source: "committee_claim", method, reference },
    });
  }
  await recordBudgetEvent({
    term: r.term,
    committeeId: r.committeeId,
    budgetId: r.budgetId,
    actorId: viewer._id,
    type: method === "credit" ? "payout_as_credit" : "payout_recorded",
    amountCents: amount,
    summary,
    refs: { reimbursementId: r._id, memberId: r.memberId },
    meta: { method, reference, appliedCents },
  });
  await tellMember(r.memberId, {
    event: "payout",
    title: "Reimbursement paid",
    body: summary,
    link: headBudgetLink(r.committeeId),
    amountCents: amount,
    refs: { reimbursementId: r._id },
    actorId: viewer._id,
  });
  const [dto] = await serializeRequests([await Reimbursement.findById(r._id).lean<any>()]);
  return { request: dto, appliedCents };
}

export async function listRequests(
  viewer: BudgetViewer,
  query: { committeeId?: any; term?: string; status?: string; queue?: "review" | "unpaid" }
): Promise<BudgetRequestDTO[]> {
  const filter: any = { committeeId: { $ne: null } };
  if (query.committeeId) {
    const access = await committeeAccess(viewer, query.committeeId);
    filter.committeeId = access.committee._id;
  } else {
    requireTreasuryViewer(viewer);
  }
  if (query.term) filter.term = query.term;
  if (query.queue === "review") filter.status = "pending";
  else if (query.queue === "unpaid") Object.assign(filter, { status: "approved", kind: "claim", "payout.status": "unpaid" });
  else if (query.status && query.status !== "all") filter.status = query.status;
  const rows = await Reimbursement.find(filter).sort(query.queue ? { createdAt: 1 } : { createdAt: -1 }).limit(500).lean<any[]>();
  return serializeRequests(rows);
}

