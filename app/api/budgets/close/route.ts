// app/api/budgets/close/route.ts
//   GET  ?term=   what closing would do, per committee
//   POST { budgetId, carryCents }   close one budget
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import { closeBudget, closePreview } from "@/lib/budgetClose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.close.get", async ({ viewer, url }) => {
  requireTreasuryViewer(viewer);
  return closePreview(readTerm(url.searchParams.get("term")));
});

export const POST = budgetRoute("budgets.close.post", async ({ viewer, body }) =>
  closeBudget(viewer, { budgetId: String(body?.budgetId ?? ""), carryCents: Number(body?.carryCents ?? 0) })
);
