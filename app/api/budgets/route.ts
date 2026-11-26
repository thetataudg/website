// app/api/budgets/route.ts
// Treasury overview: every committee's budget for a term, plus the queue counts.
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import { listBudgets } from "@/lib/budgetLedger";
import Reimbursement from "@/lib/models/Reimbursement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.get", async ({ viewer, url }) => {
  requireTreasuryViewer(viewer);
  const term = readTerm(url.searchParams.get("term"));
  const [budgets, pending, unpaid] = await Promise.all([
    listBudgets(term),
    Reimbursement.countDocuments({ term, committeeId: { $ne: null }, status: "pending" }),
    Reimbursement.countDocuments({ term, committeeId: { $ne: null }, status: "approved", kind: "claim", "payout.status": "unpaid" }),
  ]);
  return { term, budgets, counts: { pending, unpaid } };
});
