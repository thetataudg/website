// app/api/budgets/packages/route.ts
// GET: packages for a term. POST: build one { term, kind, committeeId?, amountCents?, lineId?, reason?, title? }.
import { budgetRoute } from "@/lib/budgetRoute";
import { BudgetHttpError, readTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import { createPackage, listPackages } from "@/lib/budgetPackages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.packages.get", async ({ viewer, url }) => {
  requireTreasuryViewer(viewer);
  return { packages: await listPackages(readTerm(url.searchParams.get("term"))) };
});

export const POST = budgetRoute("budgets.packages.post", async ({ viewer, body }) => {
  const kind = body?.kind ?? "term";
  if (!["term", "single", "amendment"].includes(kind)) throw new BudgetHttpError(400, "kind must be term, single or amendment");
  return {
    package: await createPackage(viewer, {
      term: readTerm(body?.term),
      kind,
      title: body?.title,
      committeeId: body?.committeeId,
      amountCents: body?.amountCents,
      lineId: body?.lineId,
      reason: body?.reason,
    }),
  };
});
