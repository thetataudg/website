"use client";

import { money, type Budget, type Totals } from "./api";
import { cn } from "@/lib/utils";
import { StatTiles } from "./ui";

/// Spent, held and free as one bar. Over budget shows the whole bar in the
/// destructive colour with the overage in words, never by colour alone.
export function UsageBar({ totals, className }: { totals: Totals; className?: string }) {
  const funded = Math.max(totals.fundedCents, 0);
  const used = totals.spentCents + totals.heldCents;
  const over = used > funded;
  const pct = (v: number) => (funded > 0 ? Math.min(100, (v / funded) * 100) : 0);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {over ? (
          <div className="h-full w-full bg-destructive" />
        ) : (
          <>
            <div className="h-full bg-primary" style={{ width: `${pct(totals.spentCents)}%` }} />
            <div className="h-full bg-primary/40" style={{ width: `${pct(totals.heldCents)}%` }} />
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {money(totals.spentCents)} spent
        {totals.heldCents > 0 ? `, ${money(totals.heldCents)} held` : ""}
        {totals.pendingCents > 0 ? `, ${money(totals.pendingCents)} waiting` : ""}
        {" of "}
        {money(totals.fundedCents)}
        {over ? (
          <span className="font-medium text-destructive"> · {money(used - funded)} over</span>
        ) : null}
      </p>
    </div>
  );
}

export function BudgetSummary({ budget }: { budget: Budget }) {
  const t = budget.totals;
  return (
    <StatTiles
      tiles={[
        { label: "Available", value: money(t.availableCents), danger: t.availableCents < 0, hint: budget.percentUsed !== null ? `${budget.percentUsed}% used` : undefined },
        { label: "Spent", value: money(t.spentCents) },
        { label: "Held", value: money(t.heldCents), hint: t.heldCents ? "Approved, not yet bought" : undefined },
        { label: "Budget", value: money(t.fundedCents), hint: t.pendingCents ? `${money(t.pendingCents)} waiting on review` : undefined },
      ]}
    />
  );
}

/// Lines as rows inside a panel, each with its own bar.
export function BudgetLines({ budget }: { budget: Budget }) {
  const lines = budget.lines.filter((l) => !l.archived || l.totals.spentCents || l.totals.fundedCents);
  return (
    <ul className="divide-y divide-border p-0">
      {lines.map((line) => (
        <li key={line._id ?? "unassigned"} className="list-none px-6 py-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="font-medium text-foreground">
              {line.name}
              {line.archived ? <span className="ml-2 text-xs text-muted-foreground">archived</span> : null}
            </p>
            <p className={cn("text-sm font-semibold tabular-nums", line.totals.availableCents < 0 ? "text-destructive" : "text-foreground")}>
              {money(line.totals.availableCents)} <span className="font-normal text-muted-foreground">left</span>
            </p>
          </div>
          <UsageBar totals={line.totals} />
        </li>
      ))}
    </ul>
  );
}
