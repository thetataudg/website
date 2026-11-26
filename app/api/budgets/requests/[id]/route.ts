// app/api/budgets/requests/[id]/route.ts
// PATCH { action, ... }
//   head:      edit, withdraw, release
//   treasurer: approve, deny, return, retag, pay, release
import { budgetRoute } from "@/lib/budgetRoute";
import { BudgetHttpError } from "@/lib/budgetAuth";
import { editRequest, payRequest, retagRequest, reviewRequest, withdrawOrRelease } from "@/lib/budgetRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = budgetRoute<{ id: string }>("budgets.request.patch", async ({ viewer, params, body }) => {
  switch (body?.action) {
    case "edit":
      return { request: await editRequest(viewer, params.id, body) };
    case "withdraw":
      return { request: await withdrawOrRelease(viewer, params.id, "withdraw") };
    case "release":
      return { request: await withdrawOrRelease(viewer, params.id, "release", body?.note ?? "") };
    case "approve":
    case "deny":
    case "return":
      return {
        request: await reviewRequest(viewer, params.id, {
          action: body.action,
          approvedCents: body?.approvedCents,
          note: body?.note,
          overrideConfirmed: Boolean(body?.overrideConfirmed),
        }),
      };
    case "retag":
      return { request: await retagRequest(viewer, params.id, body) };
    case "pay":
      return payRequest(viewer, params.id, body);
    default:
      throw new BudgetHttpError(400, "Unknown action");
  }
});
