// app/api/budgets/requests/route.ts
//   GET   ?committeeId=&term=&queue=review|unpaid&status=
//   POST  a head files a claim or pre-approval
import { budgetRoute } from "@/lib/budgetRoute";
import { readTerm } from "@/lib/budgetAuth";
import { listRequests, submitRequest } from "@/lib/budgetRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = budgetRoute("budgets.requests.get", async ({ viewer, url }) => {
  const q = url.searchParams;
  const queue = q.get("queue");
  return {
    requests: await listRequests(viewer, {
      committeeId: q.get("committeeId") || undefined,
      term: q.get("term") ? readTerm(q.get("term")) : undefined,
      status: q.get("status") ?? undefined,
      queue: queue === "review" || queue === "unpaid" ? queue : undefined,
    }),
  };
});

export const POST = budgetRoute("budgets.requests.post", async ({ viewer, body }) =>
  submitRequest(viewer, { ...body, term: readTerm(body?.term) })
);
