// app/api/budgets/proposals/[committeeId]/route.ts
// One committee's proposal ("chapter" for chapter costs).
//   GET    read it, with history
//   PUT    the head saves or submits     { term, lines, expectedIncomeCents, note, submit, version }
//   PATCH  the treasurer edits or returns { term, action: "edit" | "return", ... }
import { budgetRoute } from "@/lib/budgetRoute";
import { BudgetHttpError, readTerm } from "@/lib/budgetAuth";
import {
  loadProposal,
  loadTerm,
  proposalContext,
  returnProposal,
  serializeProposal,
  serializeTerm,
  writeProposal,
} from "@/lib/budgetProposals";
import { headBudgetLink, tellHead, tellTreasurer, TREASURER_BUDGET_LINK } from "@/lib/budgetNotify";
import { formatBudgetCents } from "@/lib/budgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { committeeId: string };

export const GET = budgetRoute<P>("budgets.proposal.get", async ({ viewer, params, url }) => {
  const term = readTerm(url.searchParams.get("term"));
  const ctx = await proposalContext(viewer, params.committeeId);
  const doc = await loadProposal(term, ctx.committee?._id ?? null);
  return {
    term: serializeTerm(await loadTerm(term), term),
    proposal: await serializeProposal(doc, term, ctx.committee),
    canEdit: ctx.isOwner,
    canReview: ctx.isTreasury && Boolean(ctx.committee),
  };
});

export const PUT = budgetRoute<P>("budgets.proposal.put", async ({ viewer, params, body }) => {
  const term = readTerm(body?.term);
  const proposal = await writeProposal(viewer, {
    term,
    committeeParam: params.committeeId,
    lines: body?.lines,
    expectedIncomeCents: body?.expectedIncomeCents,
    note: body?.note,
    intent: body?.submit ? "submit" : "save",
    expectedVersion: body?.version ?? null,
  });
  if (body?.submit && proposal.committeeId) {
    await tellTreasurer({
      event: "proposal_submitted",
      title: `${proposal.committeeName} budget proposal`,
      body: `${viewer.fName} submitted ${proposal.committeeName}'s ${term} proposal for ${formatBudgetCents(proposal.totalCents)}`,
      link: TREASURER_BUDGET_LINK,
      amountCents: proposal.totalCents,
      actorId: viewer._id,
    });
  }
  return { proposal };
});

export const PATCH = budgetRoute<P>("budgets.proposal.patch", async ({ viewer, params, body }) => {
  const term = readTerm(body?.term);
  let proposal;
  if (body?.action === "return") {
    proposal = await returnProposal(viewer, term, params.committeeId, body?.note);
    await tellHead(params.committeeId, {
      event: "proposal_returned",
      title: "Budget proposal sent back",
      body: `The treasurer sent your ${term} proposal back: ${proposal.reviewNote}`,
      link: headBudgetLink(params.committeeId),
      actorId: viewer._id,
    });
  } else if (body?.action === "edit") {
    proposal = await writeProposal(viewer, {
      term,
      committeeParam: params.committeeId,
      lines: body?.lines,
      expectedIncomeCents: body?.expectedIncomeCents,
      intent: "edit",
      expectedVersion: body?.version ?? null,
      reason: body?.reason,
    });
    const latest = proposal.history[0]?.changeSummary ?? "";
    await tellHead(params.committeeId, {
      event: "proposal_edited",
      title: "Budget proposal changed",
      body: `The treasurer changed your ${term} proposal (${latest}). Now ${formatBudgetCents(proposal.totalCents)}. ${proposal.reviewNote}`,
      link: headBudgetLink(params.committeeId),
      actorId: viewer._id,
    });
  } else {
    throw new BudgetHttpError(400, "action must be edit or return");
  }
  return { proposal };
});
