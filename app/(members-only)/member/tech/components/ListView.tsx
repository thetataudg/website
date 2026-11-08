"use client";

// A dense table for the weekly review, grouped by status, assignee or priority.
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  STATUSES,
  STATUS_LABEL,
} from "@/lib/tasks/constants";
import type { TaskDTO } from "@/lib/tasks/service";
import { AvatarStack, DueChip, PriorityIcon, StaleChip, StatusIcon, TagChip, useMemberMap, useTagMap } from "./bits";
import { useTracker } from "./TrackerProvider";

type GroupBy = "status" | "assignee" | "priority";

export function ListView() {
  const { tasks, context, applyFilters, openTask, selectedKey, setVisibleKeys } = useTracker();
  const members = useMemberMap(context?.members || []);
  const tags = useTagMap(context?.tags || []);
  const [groupBy, setGroupBy] = React.useState<GroupBy>("status");

  const groups = React.useMemo(() => {
    const visible = applyFilters(tasks).sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number
    );
    if (groupBy === "status") {
      return STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], tasks: visible.filter((t) => t.status === s) }));
    }
    if (groupBy === "priority") {
      return PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], tasks: visible.filter((t) => t.priority === p) }));
    }
    const rows = (context?.members || []).map((m) => ({
      key: m.id,
      label: m.name,
      tasks: visible.filter((t) => t.assigneeIds.includes(m.id)),
    }));
    rows.push({ key: "none", label: "Unassigned", tasks: visible.filter((t) => !t.assigneeIds.length) });
    return rows;
  }, [tasks, applyFilters, groupBy, context?.members]);

  React.useEffect(() => {
    setVisibleKeys(groups.flatMap((g) => g.tasks.map((t) => t.key)));
  }, [groups, setVisibleKeys]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Group by</span>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="h-8 w-36" aria-label="Group by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="assignee">Assignee</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {groups
          .filter((g) => g.tasks.length)
          .map((group) => (
            <section key={group.key}>
              <h3 className="m-0 flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
                <span className="font-normal">{group.tasks.length}</span>
              </h3>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {group.tasks.map((task) => (
                  <ListRow
                    key={`${group.key}-${task.id}`}
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
        {groups.every((g) => !g.tasks.length) ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No tasks match.</p>
        ) : null}
      </div>
    </div>
  );
}

export function ListRow({
  task,
  selected,
  onOpen,
  members,
  tags,
}: {
  task: TaskDTO;
  selected?: boolean;
  onOpen: () => void;
  members: ReturnType<typeof useMemberMap>;
  tags: ReturnType<typeof useTagMap>;
}) {
  return (
    <li>
      <button
        type="button"
        data-task-key={task.key}
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
          selected && "bg-accent"
        )}
      >
        <PriorityIcon priority={task.priority} />
        <span className="hidden w-20 shrink-0 font-mono text-xs text-muted-foreground sm:inline">{task.key}</span>
        <StatusIcon status={task.status} />
        <span className={cn("min-w-0 flex-1 truncate", task.status === "canceled" && "line-through")}>
          {task.title}
        </span>
        <span className="hidden gap-1 md:flex">
          {task.tagIds.slice(0, 2).map((id) => {
            const tag = tags.get(id);
            return tag ? <TagChip key={id} tag={tag} /> : null;
          })}
        </span>
        <StaleChip task={task} />
        <span className="hidden sm:inline">
          <DueChip task={task} />
        </span>
        <AvatarStack ids={task.assigneeIds} members={members} />
      </button>
    </li>
  );
}
