"use client";

// The "Tasks" card on a committee dashboard, beside the polls. Renders nothing
// unless the viewer can see this committee's tracker.
import * as React from "react";
import Link from "next/link";
import { ListTodo } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLive } from "@/components/live/useLive";

type Summary = { open: number; inProgress: number; overdue: number; mine: number; isTech: boolean } | null;

export default function CommitteeTasksCard({ committeeId }: { committeeId: string }) {
  const [summary, setSummary] = React.useState<Summary>(null);
  const load = React.useCallback(async () => {
    const res = await fetch(`/api/tasks/summary?committeeId=${encodeURIComponent(committeeId)}`, {
      cache: "no-store",
    });
    if (res.ok) setSummary(await res.json());
  }, [committeeId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  useLive("tasks", () => void load());

  if (!summary) return null;
  const href = summary.isTech ? "/member/tech" : `/member/tech?committee=${encodeURIComponent(committeeId)}`;
  const stat = (label: string, value: number, warn = false) => (
    <div>
      <div className={`text-xl font-semibold ${warn && value ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <section aria-label="Tasks">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-4">
          <div className="flex items-center gap-2 font-semibold">
            <ListTodo className="size-4 text-muted-foreground" aria-hidden="true" />
            Tasks
          </div>
          {stat("Open", summary.open)}
          {stat("In progress", summary.inProgress)}
          {stat("Overdue", summary.overdue, true)}
          {stat("Yours", summary.mine)}
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href={href}>Open tracker</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
