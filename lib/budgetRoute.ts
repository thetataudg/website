// lib/budgetRoute.ts
// The wrapper every /api/budgets route uses: auth, JSON body, error mapping.
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { budgetViewer, BudgetViewer } from "@/lib/budgetAuth";

export function budgetRoute<P = any>(
  name: string,
  handler: (ctx: { req: Request; viewer: BudgetViewer; params: P; body: any; url: URL }) => Promise<any>
) {
  return async (req: Request, context: { params: P }) => {
    try {
      const viewer = await budgetViewer(req);
      const body = req.method === "GET" ? null : await req.json().catch(() => ({}));
      const result = await handler({ req, viewer, params: context?.params, body, url: new URL(req.url) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { status: 200 });
    } catch (err: any) {
      if (!err?.statusCode) logger.error({ err, route: name }, "Budget route failed");
      return apiErrorResponse(err);
    }
  };
}
