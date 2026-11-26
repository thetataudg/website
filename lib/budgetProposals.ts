// lib/budgetProposals.ts
// The proposal step of the budget cycle: the term window, committee
// proposals, the chapter-level costs, and the treasurer's review.
import mongoose from "mongoose";
import BudgetTerm from "@/lib/models/BudgetTerm";
import BudgetProposal from "@/lib/models/BudgetProposal";
import BudgetPackage from "@/lib/models/BudgetPackage";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import { recordBudgetEvent } from "@/lib/budgetEvents";
import {
  BudgetHttpError,
  BudgetViewer,
  committeeAccess,
  headedCommitteeIds,
  isObjectId,
  requireTreasuryViewer,
} from "@/lib/budgetAuth";
import {
  ProposalAction,
  ProposalLineInput,
  canReturnProposal,
  describeLineDiff,
  diffIsEmpty,
  diffProposalLines,
  formatBudgetCents,
  normalizeProposalLines,
  planProposalWrite,
  proposalTotalCents,
} from "@/lib/budgets";

/// `committeeId` in routes: a committee id, or "chapter" for the
/// treasurer's chapter-level costs.
export const CHAPTER = "chapter";

export interface ProposalLineDTO {
  _id: string;
  name: string;
  amountCents: number;
  reason: string;
}

export interface ProposalVersionDTO {
  version: number;
  action: string;
  lines: ProposalLineDTO[];
  totalCents: number;
  expectedIncomeCents: number;
  note: string;
  editedBy: string | null;
  editedAt: string | null;
  /// What changed going from this version to the next one, as a sentence.
  changeSummary: string;
}

export interface ProposalDTO {
  _id: string | null;
  term: string;
  committeeId: string | null;
  committeeName: string;
  status: string;
  version: number;
  currentAction: string;
  lines: ProposalLineDTO[];
  totalCents: number;
  expectedIncomeCents: number;
  note: string;
  reviewNote: string;
  submittedAt: string | null;
  submittedBy: string | null;
  lastEditedBy: string | null;
  updatedAt: string | null;
  history: ProposalVersionDTO[];
}

function lineDTO(line: any): ProposalLineDTO {
  return {
    _id: line?._id ? String(line._id) : "",
    name: line?.name ?? "",
    amountCents: Number(line?.amountCents) || 0,
    reason: line?.reason ?? "",
  };
}

async function namesFor(ids: any[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const rows = await Member.find({ _id: { $in: unique } }).select("fName lName").lean<any[]>();
  return new Map(rows.map((m) => [String(m._id), `${m.fName ?? ""} ${m.lName ?? ""}`.trim()]));
}

export async function serializeProposal(
  doc: any | null,
  term: string,
  committee: { _id: any; name: string } | null
): Promise<ProposalDTO> {
  const committeeName = committee?.name ?? "Chapter costs";
  if (!doc) {
    return {
      _id: null,
      term,
      committeeId: committee ? String(committee._id) : null,
      committeeName,
      status: "not_started",
      version: 0,
      currentAction: "saved",
      lines: [],
      totalCents: 0,
      expectedIncomeCents: 0,
      note: "",
      reviewNote: "",
      submittedAt: null,
      submittedBy: null,
      lastEditedBy: null,
      updatedAt: null,
      history: [],
    };
  }
  const history: any[] = Array.isArray(doc.history) ? doc.history : [];
  const names = await namesFor([
    doc.submittedBy,
    doc.lastEditedBy,
    ...history.map((h) => h.editedBy),
  ]);
  const lines = (doc.lines ?? []).map(lineDTO);
  const versions: ProposalVersionDTO[] = history.map((h, i) => {
    const nextLines = i + 1 < history.length ? history[i + 1].lines : doc.lines;
    const diff = diffProposalLines(
      (h.lines ?? []).map(lineDTO),
      (nextLines ?? []).map(lineDTO)
    );
    return {
      version: h.version,
      action: h.action,
      lines: (h.lines ?? []).map(lineDTO),
      totalCents: proposalTotalCents(h.lines ?? []),
      expectedIncomeCents: Number(h.expectedIncomeCents) || 0,
      note: h.note ?? "",
      editedBy: h.editedBy ? names.get(String(h.editedBy)) ?? null : null,
      editedAt: h.editedAt ? new Date(h.editedAt).toISOString() : null,
      changeSummary: describeLineDiff(diff),
    };
  });
  return {
    _id: String(doc._id),
    term: doc.term,
    committeeId: doc.committeeId ? String(doc.committeeId) : null,
    committeeName,
    status: doc.status,
    version: doc.version,
    currentAction: doc.currentAction ?? "saved",
    lines,
    totalCents: proposalTotalCents(lines),
    expectedIncomeCents: Number(doc.expectedIncomeCents) || 0,
    note: doc.note ?? "",
    reviewNote: doc.reviewNote ?? "",
    submittedAt: doc.submittedAt ? new Date(doc.submittedAt).toISOString() : null,
    submittedBy: doc.submittedBy ? names.get(String(doc.submittedBy)) ?? null : null,
    lastEditedBy: doc.lastEditedBy ? names.get(String(doc.lastEditedBy)) ?? null : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    history: versions.reverse(), // newest first
  };
}

// ---------------------------------------------------------------------------
// Term window

export interface BudgetTermDTO {
  term: string;
  exists: boolean;
  proposalsOpen: boolean;
  openedAt: string | null;
  proposalsClosedAt: string | null;
}

export function serializeTerm(doc: any | null, term: string): BudgetTermDTO {
  return {
    term,
    exists: Boolean(doc),
    proposalsOpen: Boolean(doc?.proposalsOpen),
    openedAt: doc?.openedAt ? new Date(doc.openedAt).toISOString() : null,
    proposalsClosedAt: doc?.proposalsClosedAt ? new Date(doc.proposalsClosedAt).toISOString() : null,
  };
}

export async function loadTerm(term: string) {
  return BudgetTerm.findOne({ term }).lean<any>();
}

export async function listTerms(): Promise<BudgetTermDTO[]> {
  const rows = await BudgetTerm.find({}).sort({ openedAt: -1 }).lean<any[]>();
  return rows.map((r) => serializeTerm(r, r.term));
}

/// Open a term, or close / reopen its proposal window.
export async function setTermWindow(
  viewer: BudgetViewer,
  term: string,
  action: "open" | "close" | "reopen"
): Promise<BudgetTermDTO> {
  requireTreasuryViewer(viewer);
  const existing = await loadTerm(term);

  if (action === "open") {
    if (existing) throw new BudgetHttpError(409, `${term} is already open`);
    try {
      await BudgetTerm.create({ term, proposalsOpen: true, openedAt: new Date(), openedBy: viewer._id });
    } catch (err: any) {
      if (err?.code === 11000) throw new BudgetHttpError(409, `${term} is already open`);
      throw err;
    }
    await recordBudgetEvent({
      term,
      type: "term_opened",
      actorId: viewer._id,
      summary: `Opened ${term} budget proposals`,
    });
    return serializeTerm(await loadTerm(term), term);
  }

  if (!existing) throw new BudgetHttpError(404, `${term} hasn't been opened yet`);
  const open = action === "reopen";
  if (existing.proposalsOpen === open) return serializeTerm(existing, term);
  await BudgetTerm.updateOne(
    { _id: existing._id },
    open
      ? { $set: { proposalsOpen: true, proposalsClosedAt: null, proposalsClosedBy: null } }
      : { $set: { proposalsOpen: false, proposalsClosedAt: new Date(), proposalsClosedBy: viewer._id } }
  );
  await recordBudgetEvent({
    term,
    type: open ? "proposals_reopened" : "proposals_closed",
    actorId: viewer._id,
    summary: open ? `Reopened ${term} proposals` : `Closed ${term} proposals to new submissions`,
  });
  return serializeTerm(await loadTerm(term), term);
}

// ---------------------------------------------------------------------------
// Reading

export interface ProposalListRow {
  committee: { _id: string; name: string; color: string | null; headName: string } | null;
  proposal: ProposalDTO;
}

/// Treasury: every committee plus chapter costs. A head: their committees.
export async function listProposals(
  viewer: BudgetViewer,
  term: string
): Promise<{ term: BudgetTermDTO; rows: ProposalListRow[]; totalCents: number; expectedIncomeCents: number }> {
  const headed = viewer.isTreasury ? null : await headedCommitteeIds(viewer);
  if (headed && !headed.length) {
    throw new BudgetHttpError(403, "Only committee heads and the treasury can see budget proposals");
  }
  const committees = await Committee.find(headed ? { _id: { $in: headed } } : {})
    .select("_id name color committeeHeadId")
    .populate("committeeHeadId", "fName lName")
    .sort({ name: 1 })
    .lean<any[]>();
  const proposals = await BudgetProposal.find({
    term,
    committeeId: { $in: [...committees.map((c) => c._id), ...(viewer.isTreasury ? [null] : [])] },
  }).lean<any[]>();
  const byCommittee = new Map(proposals.map((p) => [p.committeeId ? String(p.committeeId) : CHAPTER, p]));

  const rows: ProposalListRow[] = [];
  for (const c of committees) {
    const head = c.committeeHeadId;
    rows.push({
      committee: {
        _id: String(c._id),
        name: c.name,
        color: c.color ?? null,
        headName: head ? `${head.fName ?? ""} ${head.lName ?? ""}`.trim() : "",
      },
      proposal: await serializeProposal(byCommittee.get(String(c._id)) ?? null, term, c),
    });
  }
  if (viewer.isTreasury) {
    rows.push({ committee: null, proposal: await serializeProposal(byCommittee.get(CHAPTER) ?? null, term, null) });
  }
  const counted = rows.filter((r) => r.proposal.status !== "not_started");
  return {
    term: serializeTerm(await loadTerm(term), term),
    rows,
    totalCents: counted.reduce((s, r) => s + r.proposal.totalCents, 0),
    expectedIncomeCents: counted.reduce((s, r) => s + r.proposal.expectedIncomeCents, 0),
  };
}

export interface ProposalContext {
  committee: any | null;
  isHead: boolean;
  isTreasury: boolean;
  /// May write the head side: the head for a committee, the treasury for
  /// chapter costs.
  isOwner: boolean;
}

export async function proposalContext(viewer: BudgetViewer, committeeParam: string): Promise<ProposalContext> {
  if (committeeParam === CHAPTER) {
    requireTreasuryViewer(viewer);
    return { committee: null, isHead: false, isTreasury: true, isOwner: true };
  }
  const access = await committeeAccess(viewer, committeeParam);
  return { committee: access.committee, isHead: access.isHead, isTreasury: access.isTreasury, isOwner: access.isHead };
}

export async function loadProposal(term: string, committeeId: any | null) {
  return BudgetProposal.findOne({ term, committeeId: committeeId ?? null }).lean<any>();
}

// ---------------------------------------------------------------------------
// Writing

/// A proposal that is on the floor can't change under the vote. The package
/// froze the version being voted on; editing now would leave the chapter
/// voting on numbers that no longer match the proposal.
export async function refuseWhileVoting(proposalId: any) {
  const voting = await BudgetPackage.exists({ status: "voting", "items.proposalId": proposalId });
  if (voting) {
    throw new BudgetHttpError(409, "This proposal is being voted on. Cancel the vote to change it.");
  }
}

function cleanLines(lines: ProposalLineInput[]) {
  return lines.map((l) => ({
    ...(l._id && isObjectId(l._id) ? { _id: new mongoose.Types.ObjectId(String(l._id)) } : {}),
    name: l.name,
    amountCents: l.amountCents,
    reason: l.reason ?? "",
  }));
}

function readIncome(raw: any): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) {
    throw new BudgetHttpError(400, "Expected income must be a whole number of cents, zero or more");
  }
  return n;
}

export interface WriteProposalInput {
  term: string;
  committeeParam: string;
  lines: any;
  expectedIncomeCents: any;
  note?: string;
  /// "save" or "submit" for the owner; "edit" for a treasurer edit.
  intent: "save" | "submit" | "edit";
  /// The version the client loaded. A mismatch means someone else changed
  /// it in the meantime, and the write is refused rather than clobbering it.
  expectedVersion?: number | null;
  /// Required on a treasurer edit: shown to the head and kept in the log.
  reason?: string;
}

export async function writeProposal(viewer: BudgetViewer, input: WriteProposalInput): Promise<ProposalDTO> {
  const ctx = await proposalContext(viewer, input.committeeParam);
  const committeeId = ctx.committee?._id ?? null;
  const isChapter = committeeId === null;

  const { lines, error } = normalizeProposalLines(input.lines);
  if (error) throw new BudgetHttpError(400, error);
  const expectedIncomeCents = readIncome(input.expectedIncomeCents);
  const note = String(input.note ?? "").trim().slice(0, 2000);

  let as: "head" | "treasurer";
  let action: ProposalAction;
  if (input.intent === "edit") {
    if (!ctx.isTreasury) throw new BudgetHttpError(403, "Only the treasury can edit a submitted proposal");
    if (isChapter) throw new BudgetHttpError(400, "Chapter costs are saved, not edited");
    as = "treasurer";
    action = "treasurer_edit";
    if (!String(input.reason ?? "").trim()) {
      throw new BudgetHttpError(400, "Say why you changed it. The head will see this.");
    }
  } else {
    if (!ctx.isOwner) throw new BudgetHttpError(403, "Only this committee's head can file its proposal");
    as = "head";
    action = input.intent === "submit" ? "submitted" : "saved";
    if (!isChapter) {
      const termDoc = await loadTerm(input.term);
      if (!termDoc) throw new BudgetHttpError(409, `${input.term} proposals haven't opened yet`);
      if (!termDoc.proposalsOpen) throw new BudgetHttpError(409, `${input.term} proposals are closed`);
    }
    if (action === "submitted" && !lines.length) {
      throw new BudgetHttpError(400, "Add at least one line before submitting");
    }
  }

  const current = await loadProposal(input.term, committeeId);
  if (
    current &&
    input.expectedVersion !== undefined &&
    input.expectedVersion !== null &&
    Number(input.expectedVersion) !== current.version
  ) {
    throw new BudgetHttpError(409, "This proposal changed while you were editing. Reload to see the latest.");
  }

  if (current) await refuseWhileVoting(current._id);

  const plan = planProposalWrite(
    current
      ? {
          version: current.version,
          currentAction: current.currentAction ?? "saved",
          status: current.status,
          lines: current.lines ?? [],
          expectedIncomeCents: current.expectedIncomeCents ?? 0,
          note: current.note ?? "",
        }
      : null,
    { action, as, lines, expectedIncomeCents, note }
  );
  if (!plan.ok) throw new BudgetHttpError(409, plan.error ?? "That change isn't allowed");

  const now = new Date();
  const set: Record<string, any> = {
    lines: cleanLines(lines),
    expectedIncomeCents,
    note: as === "treasurer" ? current?.note ?? "" : note,
    status: plan.status,
    version: plan.version,
    currentAction: action,
    lastEditedBy: viewer._id,
  };
  if (action === "submitted") {
    set.submittedBy = viewer._id;
    set.submittedAt = now;
  }
  if (as === "treasurer") set.reviewNote = String(input.reason).trim().slice(0, 2000);

  let doc: any;
  if (!current) {
    try {
      doc = await BudgetProposal.create({ term: input.term, committeeId, ...set });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BudgetHttpError(409, "This proposal was just created by someone else. Reload to see it.");
      }
      throw err;
    }
    doc = doc.toObject();
  } else {
    const update: Record<string, any> = { $set: set };
    if (plan.archive) {
      update.$push = {
        history: {
          version: current.version,
          lines: current.lines ?? [],
          expectedIncomeCents: current.expectedIncomeCents ?? 0,
          note: current.note ?? "",
          editedBy: current.lastEditedBy ?? null,
          editedAt: current.updatedAt ?? now,
          action: current.currentAction ?? "submitted",
        },
      };
    }
    // Guarded on version and status: if anything moved since we read it,
    // nothing is written and the caller is told to reload.
    doc = await BudgetProposal.findOneAndUpdate(
      { _id: current._id, version: current.version, status: current.status },
      update,
      { new: true }
    ).lean<any>();
    if (!doc) {
      throw new BudgetHttpError(409, "This proposal changed while you were editing. Reload to see the latest.");
    }
  }

  // ---- log
  const name = ctx.committee?.name ?? "Chapter costs";
  const before = current
    ? { version: current.version, status: current.status, totalCents: proposalTotalCents(current.lines ?? []), lines: (current.lines ?? []).map(lineDTO), expectedIncomeCents: current.expectedIncomeCents ?? 0 }
    : null;
  const after = { version: doc.version, status: doc.status, totalCents: proposalTotalCents(doc.lines ?? []), lines: (doc.lines ?? []).map(lineDTO), expectedIncomeCents: doc.expectedIncomeCents ?? 0 };
  const diff = diffProposalLines((current?.lines ?? []).map(lineDTO), (doc.lines ?? []).map(lineDTO));
  const total = formatBudgetCents(after.totalCents);
  let summary: string;
  let type: any = plan.event;
  if (isChapter) {
    type = "chapter_costs_set";
    summary = `Set ${input.term} chapter costs to ${total}`;
  } else if (plan.event === "proposal_edited") {
    summary = `Treasurer edited ${name}'s proposal: ${describeLineDiff(diff)}. Total ${formatBudgetCents(before?.totalCents ?? 0)} to ${total}`;
  } else if (plan.event === "proposal_submitted") {
    summary = `${name} submitted a ${total} proposal for ${input.term}`;
  } else if (plan.event === "proposal_resubmitted") {
    summary = `${name} resubmitted its proposal at ${total}` + (diffIsEmpty(diff) ? "" : `: ${describeLineDiff(diff)}`);
  } else {
    summary = `${name} saved a draft proposal (${total})`;
  }
  await recordBudgetEvent({
    term: input.term,
    committeeId,
    actorId: viewer._id,
    type,
    amountCents: after.totalCents,
    summary,
    before,
    after,
    refs: { proposalId: doc._id },
    meta: { diff, reason: as === "treasurer" ? set.reviewNote : undefined },
  });

  // Notifications are fired by the caller (see lib/budgetNotify.ts) so this
  // module stays testable without the notify stack.
  return serializeProposal(doc, input.term, ctx.committee);
}

/// The treasurer sends a submitted proposal back to the head with a note.
export async function returnProposal(
  viewer: BudgetViewer,
  term: string,
  committeeParam: string,
  note: string
): Promise<ProposalDTO> {
  const ctx = await proposalContext(viewer, committeeParam);
  if (!ctx.isTreasury) throw new BudgetHttpError(403, "Only the treasury can send a proposal back");
  if (!ctx.committee) throw new BudgetHttpError(400, "Chapter costs can't be sent back");
  const reason = String(note ?? "").trim();
  if (!reason) throw new BudgetHttpError(400, "Add a note so the head knows what to change");
  const current = await loadProposal(term, ctx.committee._id);
  if (!current) throw new BudgetHttpError(404, "There's no proposal to send back");
  await refuseWhileVoting(current._id);
  if (!canReturnProposal(current.status)) {
    throw new BudgetHttpError(409, "Only a submitted proposal can be sent back");
  }
  const doc = await BudgetProposal.findOneAndUpdate(
    { _id: current._id, version: current.version, status: "submitted" },
    { $set: { status: "returned", reviewNote: reason.slice(0, 2000), lastEditedBy: viewer._id } },
    { new: true }
  ).lean<any>();
  if (!doc) throw new BudgetHttpError(409, "This proposal changed. Reload and try again.");
  await recordBudgetEvent({
    term,
    committeeId: ctx.committee._id,
    actorId: viewer._id,
    type: "proposal_returned",
    amountCents: proposalTotalCents(doc.lines ?? []),
    summary: `Sent ${ctx.committee.name}'s proposal back: ${reason}`,
    before: { status: "submitted" },
    after: { status: "returned", reviewNote: reason },
    refs: { proposalId: doc._id },
  });
  return serializeProposal(doc, term, ctx.committee);
}
