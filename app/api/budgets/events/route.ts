// app/api/budgets/events/route.ts
// The action log. ?committeeId= for one committee (head or treasury), or the
// whole chapter (treasury). ?term= to narrow, ?before= (ISO) to page back.
import { budgetRoute } from "@/lib/budgetRoute";
import { committeeAccess, readTerm, requireTreasuryViewer } from "@/lib/budgetAuth";
import BudgetEvent from "@/lib/models/BudgetEvent";
import Member from "@/lib/models/Member";
import Committee from "@/lib/models/Committee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 50;

export const GET = budgetRoute("budgets.events.get", async ({ viewer, url }) => {
  const q = url.searchParams;
  const filter: any = {};
  const committeeId = q.get("committeeId");
  if (committeeId) {
    const access = await committeeAccess(viewer, committeeId);
    filter.committeeId = access.committee._id;
  } else {
    requireTreasuryViewer(viewer);
  }
  if (q.get("term")) filter.term = readTerm(q.get("term"));
  const before = q.get("before");
  if (before && !Number.isNaN(Date.parse(before))) filter.occurredAt = { $lt: new Date(before) };

  const rows = await BudgetEvent.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(PAGE + 1).lean<any[]>();
  const page = rows.slice(0, PAGE);
  const [actors, committees] = await Promise.all([
    Member.find({ _id: { $in: page.map((e) => e.actorId).filter(Boolean) } }).select("fName lName").lean<any[]>(),
    Committee.find({ _id: { $in: page.map((e) => e.committeeId).filter(Boolean) } }).select("name").lean<any[]>(),
  ]);
  const actorName = new Map(actors.map((a) => [String(a._id), `${a.fName ?? ""} ${a.lName ?? ""}`.trim()]));
  const committeeName = new Map(committees.map((c) => [String(c._id), c.name]));
  return {
    events: page.map((e) => ({
      _id: String(e._id),
      type: e.type,
      term: e.term,
      occurredAt: new Date(e.occurredAt).toISOString(),
      committeeId: e.committeeId ? String(e.committeeId) : null,
      committeeName: e.committeeId ? committeeName.get(String(e.committeeId)) ?? "" : "Chapter",
      actor: e.actorId ? actorName.get(String(e.actorId)) ?? "Someone" : "System",
      amountCents: e.amountCents ?? null,
      summary: e.summary,
      before: e.before ?? null,
      after: e.after ?? null,
    })),
    nextBefore: rows.length > PAGE ? new Date(page[page.length - 1].occurredAt).toISOString() : null,
  };
});
