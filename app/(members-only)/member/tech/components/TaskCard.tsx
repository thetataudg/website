"use client";

import * as React from "react";
import { ListChecks, Bug } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RosterMember, TagDTO, TaskDTO } from "@/lib/tasks/service";
import { AvatarStack, DueChip, PriorityIcon, StaleChip, TagChip, Tip } from "./bits";
import { PRIORITY_LABEL } from "@/lib/tasks/constants";

export function TaskCard({
  task,
  members,
  tags,
  selected,
  onOpen,
  draggable,
  onDragStart,
}: {
  task: TaskDTO;
  members: Map<string, RosterMember>;
  tags: Map<string, TagDTO>;
  selected?: boolean;
  onOpen: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  const done = task.checklist.filter((c) => c.done).length;
  return (
    <button
      type="button"
      data-task-key={task.key}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      className={cn(
        "group w-full rounded-md border border-border bg-card p-3 text-left text-card-foreground shadow-sm transition-colors",
        "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary ring-1 ring-primary",
        (task.status === "done" || task.status === "canceled") && "opacity-75"
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{task.key}</span>
        <Tip label={`${PRIORITY_LABEL[task.priority]} priority`} side="top">
          <span className="inline-flex">
            <PriorityIcon priority={task.priority} />
          </span>
        </Tip>
      </div>
      <p className={cn("mt-1 text-sm font-medium leading-snug", task.status === "canceled" && "line-through")}>
        {task.title}
      </p>
      {task.tagIds.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tagIds.map((id) => {
            const tag = tags.get(id);
            return tag ? <TagChip key={id} tag={tag} /> : null;
          })}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <DueChip task={task} />
        <StaleChip task={task} />
        {task.checklist.length ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ListChecks className="size-3.5" aria-hidden="true" />
            {done}/{task.checklist.length}
          </span>
        ) : null}
        {task.bugReportId ? (
          <Tip label="From a bug report" side="top">
            <span className="inline-flex">
              <Bug className="size-3.5 text-muted-foreground" aria-label="From a bug report" />
            </span>
          </Tip>
        ) : null}
        <span className="ml-auto">
          <AvatarStack ids={task.assigneeIds} members={members} />
        </span>
      </div>
    </button>
  );
}
