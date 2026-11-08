"use client";

// Placeholders shaped like what loads into them, so nothing jumps.
import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";

const COLUMN_CARDS = [3, 2, 2, 1, 1, 0];

export function BoardSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3 overflow-hidden">
      {COLUMN_CARDS.map((cards, i) => (
        <div key={i} className="flex min-w-[15rem] flex-1 flex-col gap-2 rounded-lg bg-muted/50 p-2">
          <div className="flex items-center gap-2 px-1 pb-1 pt-1">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          {Array.from({ length: cards }, (_, j) => (
            <CardSkeleton key={j} />
          ))}
          <Skeleton className="h-8 w-full bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="size-3.5" />
      </div>
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-14 rounded" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="size-6 rounded-full" />
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-border rounded-lg border border-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - ((i * 13) % 30)}%` }} />
          <Skeleton className="ml-auto h-3 w-12" />
          <Skeleton className="size-6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TrackerSkeleton({ view }: { view: "board" | "rows" }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading the tracker">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="flex gap-4 border-b border-border pb-2">
        {[64, 44, 32, 60, 40, 44].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-56" />
        {[64, 84, 70, 48, 120].map((w, i) => (
          <Skeleton key={i} className="h-9" style={{ width: w }} />
        ))}
      </div>
      {view === "board" ? <BoardSkeleton /> : <RowsSkeleton />}
    </div>
  );
}

export function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row" role="status" aria-label="Loading the task">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex items-center justify-between pr-8">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-8" />
            ))}
          </div>
        </div>
        <Skeleton className="h-7 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          {[70, 55, 80, 45].map((w, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3" style={{ width: `${w}%` }} />
            </div>
          ))}
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <div className="w-full shrink-0 space-y-4 rounded-lg border border-border p-4 lg:w-64">
        {["Status", "Priority", "Assignees", "Due", "Tags"].map((label) => (
          <div key={label} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {[70, 55, 80].map((w, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}
