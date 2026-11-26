// app/api/budgets/export/route.ts
// GET ?term=  the term's budgets and full action log as CSV.
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import { exportTermCsv } from "@/lib/budgetClose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.export", async ({ viewer, url }) => {
  requireTreasuryViewer(viewer);
  const term = readTerm(url.searchParams.get("term"));
  const csv = await exportTermCsv(term);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budgets-${term.replace(/\s+/g, "-").toLowerCase()}.csv"`,
    },
  });
});
