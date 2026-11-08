"use client";

// Archived tasks: out of every other view, kept here with their history.
// Click one to open it, or Restore to put it back where it was.
import * as React from "react";
import { DateTime } from "luxon";
import { ArchiveRestore, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCachedJson } from "@/components/live/cachedFetch";
import { STATUS_LABEL, TASK_ZONE } from "@/lib/tasks/constants";
import type { TaskDTO, TrackerContext } from "@/lib/tasks/service";
import { AvatarStack, StatusIcon, TagChip, Tip, useMemberMap, useTagMap } from "./bits";
import { RowsSkeleton } from "./Skeletons";
import { useTracker } from "./TrackerProvider";

export function ArchivedView() {
  const { committeeParam, context, openTask, reload } = useTracker();
  const query = `archived=only${committeeParam ? `&committeeId=${encodeURIComponent(committeeParam)}` : ""}`;
  const { data, refresh, mutate } = useCachedJson<{ tasks: TaskDTO[]; context: TrackerContext }>(`/api/tasks?${query}`, {
    topic: "tasks",
  });
  const members = useMemberMap(context?.members || []);
  const tags = useTagMap(context?.tags || []);
  const [q, setQ] = React.useState("");

  const tasks = data?.tasks ?? null;
  const needle = q.trim().toLowerCase();
  const shown = (tasks || []).filter(
    (t) => !needle || t.title.toLowerCase().includes(needle) || t.key.toLowerCase().includes(needle)
  );

  const restore = async (task: TaskDTO) => {
    // Gone from this list at once; back if the server says no.
    if (data) mutate({ ...data, tasks: data.tasks.filter((t) => t.id !== task.id) });
    const res = await fetch(`/api/tasks/${encodeURIComponent(task.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (!res.ok) {
      toast.error("Could not restore the task");
      void refresh();
      return;
    }
    toast.success(`${task.key} restored to ${STATUS_LABEL[task.status]}`);
    void reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search archived tasks"
            placeholder="Search archived tasks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            className="h-9 pl-8"
          />
        </div>
        {tasks ? (
          <span className="text-xs text-muted-foreground">
            {needle ? `${shown.length} of ${tasks.length}` : `${tasks.length} archived`}
          </span>
        ) : null}
      </div>

      {tasks === null ? (
        <RowsSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {tasks.length ? "No archived tasks match that search." : "Nothing archived. Archive a task from its panel to tidy the board."}
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-lg border border-border bg-card p-0">
          {shown.map((task) => (
            <li key={task.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
              <button
                type="button"
                onClick={() => openTask(task.key)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
                <Tip label={STATUS_LABEL[task.status]}>
                  <span className="inline-flex">
                    <StatusIcon status={task.status} />
                  </span>
                </Tip>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.title}</span>
                <span className="hidden gap-1 md:flex">
                  {task.tagIds.map((id) => {
                    const tag = tags.get(id);
                    return tag ? <TagChip key={id} tag={tag} /> : null;
                  })}
                </span>
                {task.archivedAt ? (
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    Archived {DateTime.fromISO(task.archivedAt).setZone(TASK_ZONE).toFormat("LLL d")}
                  </span>
                ) : null}
                <AvatarStack ids={task.assigneeIds} members={members} />
              </button>
              <Button variant="outline" size="sm" onClick={() => restore(task)}>
                <ArchiveRestore aria-hidden="true" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
