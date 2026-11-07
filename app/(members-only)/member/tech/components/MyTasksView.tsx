"use client";

// Your open tasks grouped by status, with a "due this week" strip on top.
import * as React from "react";

import { OPEN_STATUSES, STATUS_LABEL } from "@/lib/tasks/constants";
import { DueChip, StatusIcon, useMemberMap, useTagMap } from "./bits";
import { ListRow } from "./ListView";
import { useTracker } from "./TrackerProvider";

export function MyTasksView() {
  const { tasks, context, applyFilters, openTask, selectedKey, setVisibleKeys } = useTracker();
  const members = useMemberMap(context?.members || []);
  const tags = useTagMap(context?.tags || []);
  const me = context?.viewer.id;

  const mine = React.useMemo(
    () =>
      applyFilters(tasks).filter(
        (t) => me && t.assigneeIds.includes(me) && OPEN_STATUSES.includes(t.status)
      ),
    [tasks, applyFilters, me]
  );
  const week = React.useMemo(() => {
    const now = Date.now();
    return mine
      .filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= now + 7 * 86_400_000)
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  }, [mine]);
  const groups = OPEN_STATUSES.map((status) => ({
    status,
    tasks: mine.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  React.useEffect(() => {
    setVisibleKeys(groups.flatMap((g) => g.tasks.map((t) => t.key)));
  });

  if (!mine.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing assigned to you.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {week.length ? (
        <section aria-label="Due this week">
          <h2 className="m-0 mb-2 text-sm font-semibold text-foreground">Due this week</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {week.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task.key)}
                className="w-56 shrink-0 rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary/50"
              >
                <span className="block font-mono text-xs text-muted-foreground">{task.key}</span>
                <span className="mt-1 block truncate font-medium">{task.title}</span>
                <span className="mt-1 block">
                  <DueChip task={task} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border">
        {groups
          .filter((g) => g.tasks.length)
          .map((group) => (
            <section key={group.status}>
              <h3 className="m-0 flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <StatusIcon status={group.status} />
                {STATUS_LABEL[group.status]}
                <span className="font-normal">{group.tasks.length}</span>
              </h3>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {group.tasks.map((task) => (
                  <ListRow
                    key={task.id}
                    task={task}
                    selected={selectedKey === task.key}
                    onOpen={() => openTask(task.key)}
                    members={members}
                    tags={tags}
                  />
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
