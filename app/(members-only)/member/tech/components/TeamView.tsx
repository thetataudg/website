"use client";

// One factual row per committee member. Listed in roster order, never ranked.
import * as React from "react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TASK_ZONE } from "@/lib/tasks/constants";
import type { TeamRow } from "@/lib/tasks/service";
import { RowsSkeleton } from "./Skeletons";
import { useCachedJson } from "@/components/live/cachedFetch";
import { useTracker } from "./TrackerProvider";

export function TeamView() {
  const { committeeParam, context, setFilters, hrefFor } = useTracker();
  const router = useRouter();
  const q = committeeParam ? `?committeeId=${encodeURIComponent(committeeParam)}` : "";
  const { data, error } = useCachedJson<TeamRow[]>(context?.viewer.canManage ? `/api/tasks/team${q}` : null, {
    topic: "tasks",
  });
  const rows = data ?? null;

  if (context && !context.viewer.canManage) {
    return <p className="text-sm text-muted-foreground">Only the committee head can see the team view.</p>;
  }
  if (error && !rows) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows) return <RowsSkeleton rows={5} />;

  const num = (n: number, warn = false) => (
    <span className={warn && n > 0 ? "font-semibold text-red-700 dark:text-red-400" : undefined}>{n}</span>
  );

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">In progress</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead className="text-right">Stale</TableHead>
            <TableHead className="text-right">Done this week</TableHead>
            <TableHead>Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.memberId}>
              <TableCell>
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={() => {
                    setFilters((f) => ({ ...f, assignee: row.memberId }));
                    router.push(hrefFor("/member/tech/list"));
                  }}
                >
                  {row.name}
                </button>
                {row.isHead ? <span className="ml-2 text-xs text-muted-foreground">Head</span> : null}
              </TableCell>
              <TableCell className="text-right">{num(row.open)}</TableCell>
              <TableCell className="text-right">{num(row.inProgress)}</TableCell>
              <TableCell className="text-right">{num(row.overdue, true)}</TableCell>
              <TableCell className="text-right">{num(row.stale, true)}</TableCell>
              <TableCell className="text-right">{num(row.doneThisWeek)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.lastActivityAt
                  ? DateTime.fromISO(row.lastActivityAt).setZone(TASK_ZONE).toFormat("LLL d")
                  : "None yet"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
