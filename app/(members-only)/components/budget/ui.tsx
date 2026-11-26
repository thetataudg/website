"use client";

// Layout pieces for the budget pages, matching the rest of the members app:
// the dues console's stat tiles, the dashboard's icon-pill panels, and
// skeletons shaped like the content they stand in for.
import * as React from "react";
import { CircleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function IconPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary [&_svg]:size-4", className)}>
      {children}
    </span>
  );
}

export interface Tile {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  danger?: boolean;
}

export function StatTiles({ tiles, className }: { tiles: Tile[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", tiles.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4", className)}>
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</dt>
          <dd className={cn("mt-1 text-xl font-semibold tabular-nums", tile.danger ? "text-destructive" : "text-foreground")}>{tile.value}</dd>
          {tile.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/// A titled card: icon pill, title, one-line description, optional actions.
export function Panel({
  icon,
  title,
  description,
  actions,
  children,
  className,
  flush = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /// Content runs edge to edge (lists with their own dividers).
  flush?: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-border">
        {icon ? <IconPill>{icon}</IconPill> : null}
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={flush ? "p-0" : "p-6"}>{children}</CardContent>
    </Card>
  );
}

/// Inline reason a form can't be saved yet. Shown as the user types, so a
/// bad amount is refused before anything is sent.
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Skeletons

function Busy({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", count >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 4, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <Busy label={label} className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </Busy>
  );
}

export function BudgetCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Busy label="Loading budgets…" className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </Busy>
  );
}

export function LinesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Busy label="Loading lines…" className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-3 px-6 py-4">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </Busy>
  );
}

/// The whole page while its first load is in flight: header, tiles, tabs,
/// and a panel of rows.
export function BudgetPageSkeleton({ tiles = 4, cards = false }: { tiles?: number; cards?: boolean }) {
  return (
    <Busy label="Loading budget…" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>
      <TilesSkeleton count={tiles} />
      <Skeleton className="h-10 w-80 rounded-lg" />
      {cards ? (
        <BudgetCardsSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border p-6">
            <Skeleton className="size-9 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <LinesSkeleton />
        </div>
      )}
    </Busy>
  );
}
