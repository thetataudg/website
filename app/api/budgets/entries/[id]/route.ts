// app/api/budgets/entries/[id]/route.ts
// POST { note }: reverse a money movement. The original stays on the record.
import { budgetRoute } from "@/lib/budgetRoute";
import { reverseEntry } from "@/lib/budgetLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = budgetRoute<{ id: string }>("budgets.entry.reverse", async ({ viewer, params, body }) => ({
  reversal: await reverseEntry(viewer, params.id, body?.note),
}));
