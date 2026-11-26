// app/api/budgets/ledger/[budgetId]/route.ts
// Treasurer money tools on one budget.
//   POST   an entry      { kind, lineId, amountCents, note, toBudgetId?, toLineId?, occurredOn?, receiptUrls? }
//   PATCH  a line        { action: "add_line" | "rename_line" | "archive_line", lineId?, name? }
import { budgetRoute } from "@/lib/budgetRoute";
import { BudgetHttpError } from "@/lib/budgetAuth";
import { addEntry, addLine, archiveLine, loadBudgetById, renameLine, serializeBudget, totalsFor } from "@/lib/budgetLedger";
import { headBudgetLink, tellHead } from "@/lib/budgetNotify";
import { formatBudgetCents } from "@/lib/budgets";
import Committee from "@/lib/models/Committee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { budgetId: string };

async function fresh(budgetId: any) {
  const budget = await loadBudgetById(budgetId);
  const committee = await Committee.findById(budget.committeeId).select("_id name color").lean<any>();
  return serializeBudget(budget, committee, await totalsFor(budget));
}

const KINDS = ["allocation", "adjustment", "income", "direct_spend", "transfer"];

export const POST = budgetRoute<P>("budgets.ledger.post", async ({ viewer, params, body }) => {
  if (!KINDS.includes(body?.kind)) throw new BudgetHttpError(400, "Unknown entry kind");
  const entry = await addEntry(viewer, { ...body, budgetId: params.budgetId });
  const budget = await loadBudgetById(params.budgetId);
  const amount = formatBudgetCents(Math.abs(Number(body.amountCents)));
  const words: Record<string, string> = {
    allocation: `The treasurer added ${amount} to your budget`,
    adjustment: Number(body.amountCents) > 0 ? `The treasurer raised your budget by ${amount}` : `The treasurer lowered your budget by ${amount}`,
    income: `${amount} income was recorded on your budget`,
    direct_spend: `The chapter spent ${amount} from your budget`,
    transfer: `The treasurer moved ${amount}`,
  };
  const note = body?.note ? `: ${String(body.note).trim()}` : "";
  await tellHead(budget.committeeId, { event: body.kind, title: "Budget updated", body: words[body.kind] + note, link: headBudgetLink(budget.committeeId), actorId: viewer._id, quiet: true });
  if (body.kind === "transfer" && entry.to?.budgetId && String(entry.to.budgetId) !== String(budget._id)) {
    const to = await loadBudgetById(entry.to.budgetId);
    await tellHead(to.committeeId, { event: "transfer_in", title: "Budget updated", body: `Your budget received ${amount}${note}`, link: headBudgetLink(to.committeeId), actorId: viewer._id, quiet: true });
  }
  return { budget: await fresh(params.budgetId) };
});

export const PATCH = budgetRoute<P>("budgets.ledger.patch", async ({ viewer, params, body }) => {
  switch (body?.action) {
    case "add_line":
      await addLine(viewer, params.budgetId, body?.name);
      break;
    case "rename_line":
      await renameLine(viewer, params.budgetId, body?.lineId, body?.name);
      break;
    case "archive_line":
      await archiveLine(viewer, params.budgetId, body?.lineId);
      break;
    default:
      throw new BudgetHttpError(400, "Unknown action");
  }
  return { budget: await fresh(params.budgetId) };
});
