// app/api/budgets/proposals/route.ts
// Every proposal for a term the viewer may see.
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm } from "@/lib/budgetAuth";
import { listProposals } from "@/lib/budgetProposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.proposals.get", async ({ viewer, url }) =>
  listProposals(viewer, readTerm(url.searchParams.get("term")))
);
