// app/api/budgets/packages/[id]/route.ts
// Moving a package through its vote, and the dues that follow.
//   { action: "open_vote" | "cancel_vote" | "discard" | "use_vote" | "record" | "set_dues" | "dues_assigned", ... }
import { budgetRoute } from "@/lib/budgetRoute";
import { BudgetHttpError } from "@/lib/budgetAuth";
import {
  cancelPackage,
  cancelVote,
  markDuesAssigned,
  openAppVote,
  recordVoteResult,
  setFinalDues,
  useAppVoteResult,
  PackageDTO,
} from "@/lib/budgetPackages";
import { headBudgetLink, tellHead } from "@/lib/budgetNotify";
import { formatBudgetCents } from "@/lib/budgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function announceResult(pkg: PackageDTO, actorId: any) {
  if (pkg.status !== "approved" && pkg.status !== "rejected") return;
  const committees = pkg.kind === "amendment"
    ? [{ id: pkg.amendment?.committeeId, total: pkg.amendment?.amountCents ?? 0 }]
    : pkg.items.filter((i) => i.committeeId).map((i) => ({ id: i.committeeId, total: i.totalCents }));
  for (const c of committees) {
    if (!c.id) continue;
    await tellHead(c.id, {
      event: pkg.status === "approved" ? "package_approved" : "package_rejected",
      title: pkg.status === "approved" ? "Budget approved" : "Budget not approved",
      body:
        pkg.status === "approved"
          ? `The chapter approved "${pkg.title}". Your committee has ${formatBudgetCents(c.total)} to work with.`
          : `The chapter didn't approve "${pkg.title}". The treasurer will follow up.`,
      link: headBudgetLink(c.id),
      actorId,
    });
  }
}

export const PATCH = budgetRoute<{ id: string }>("budgets.package.patch", async ({ viewer, params, body }) => {
  let pkg: PackageDTO;
  switch (body?.action) {
    case "open_vote":
      pkg = await openAppVote(viewer, params.id);
      break;
    case "cancel_vote":
      pkg = await cancelVote(viewer, params.id);
      break;
    case "discard":
      await cancelPackage(viewer, params.id);
      return { ok: true };
    case "use_vote":
      pkg = await useAppVoteResult(viewer, params.id);
      await announceResult(pkg, viewer._id);
      break;
    case "record":
      pkg = await recordVoteResult(viewer, params.id, body);
      await announceResult(pkg, viewer._id);
      break;
    case "set_dues":
      pkg = await setFinalDues(viewer, params.id, body?.finalDuesCents);
      break;
    case "dues_assigned":
      pkg = await markDuesAssigned(viewer, params.id, String(body?.batchId ?? ""));
      break;
    default:
      throw new BudgetHttpError(400, "Unknown action");
  }
  return { package: pkg };
});
