// app/api/budgets/terms/route.ts
// GET: the term picker. POST: open a term, or close / reopen its proposals.
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm, BudgetHttpError } from "@/lib/budgetAuth";
import { listTerms, loadTerm, serializeTerm, setTermWindow } from "@/lib/budgetProposals";
import { getDefaultSemesterRange } from "@/lib/gem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.terms.get", async ({ url }) => {
  const current = getDefaultSemesterRange().name;
  const term = readTerm(url.searchParams.get("term"));
  return { current, term: serializeTerm(await loadTerm(term), term), terms: await listTerms() };
});

export const POST = budgetRoute("budgets.terms.post", async ({ viewer, body }) => {
  const action = body?.action;
  if (!["open", "close", "reopen"].includes(action)) throw new BudgetHttpError(400, "action must be open, close or reopen");
  return { term: await setTermWindow(viewer, readTerm(body?.term), action) };
});
