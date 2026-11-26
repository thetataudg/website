// app/api/budgets/committee/[committeeId]/route.ts
// Everything a head's budget page needs in one read.
import { budgetRoute } from "@/lib/budgetRoute";
import { committeeAccess, readTerm } from "@/lib/budgetAuth";
import { entriesTouching, loadBudget, serializeBudget, serializeEntries, totalsFor } from "@/lib/budgetLedger";
import { listRequests } from "@/lib/budgetRequests";
import { loadProposal, loadTerm, serializeProposal, serializeTerm } from "@/lib/budgetProposals";
import CommitteeBudget from "@/lib/models/CommitteeBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute<{ committeeId: string }>("budgets.committee.get", async ({ viewer, params, url }) => {
  const term = readTerm(url.searchParams.get("term"));
  const access = await committeeAccess(viewer, params.committeeId);
  const [budgetDoc, proposalDoc, termDoc, terms] = await Promise.all([
    loadBudget(access.committee._id, term),
    loadProposal(term, access.committee._id),
    loadTerm(term),
    CommitteeBudget.find({ committeeId: access.committee._id }).select("term").lean<any[]>(),
  ]);
  const budget = budgetDoc ? serializeBudget(budgetDoc, access.committee, await totalsFor(budgetDoc)) : null;
  return {
    term: serializeTerm(termDoc, term),
    committee: { _id: String(access.committee._id), name: access.committee.name, color: access.committee.color ?? null },
    viewer: { isHead: access.isHead, isTreasury: access.isTreasury },
    proposal: await serializeProposal(proposalDoc, term, access.committee),
    budget,
    entries: budgetDoc ? serializeEntries(await entriesTouching([budgetDoc._id])).reverse() : [],
    requests: budgetDoc ? await listRequests(viewer, { committeeId: access.committee._id, term }) : [],
    budgetTerms: terms.map((t) => t.term),
  };
});
