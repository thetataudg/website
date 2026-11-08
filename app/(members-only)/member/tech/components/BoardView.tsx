"use client";

// Columns by status. Drag a card to move it; each column has a quick-create
// input (type a title, Enter, keep typing).
import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STATUSES, STATUS_LABEL, type TaskStatus } from "@/lib/tasks/constants";
import type { TaskDTO } from "@/lib/tasks/service";
import { StatusIcon, useMemberMap, useTagMap } from "./bits";
import { TaskCard } from "./TaskCard";
import { useTracker } from "./TrackerProvider";

export function BoardView() {
  const { tasks, context, applyFilters, openTask, selectedKey, setVisibleKeys, moveTask, createTask } = useTracker();
  const members = useMemberMap(context?.members || []);
  const tags = useTagMap(context?.tags || []);
  const [dragging, setDragging] = React.useState<TaskDTO | null>(null);
  const [over, setOver] = React.useState<{ status: TaskStatus; index: number } | null>(null);

  const columns = React.useMemo(() => {
    const visible = applyFilters(tasks);
    return STATUSES.map((status) => ({
      status,
      tasks: visible.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number),
    }));
  }, [tasks, applyFilters]);

  React.useEffect(() => {
    setVisibleKeys(columns.flatMap((c) => c.tasks.map((t) => t.key)));
  }, [columns, setVisibleKeys]);

  const drop = (status: TaskStatus) => {
    if (!dragging || !over) return;
    const list = columns.find((c) => c.status === status)!.tasks.filter((t) => t.id !== dragging.id);
    const before = list[over.index - 1] ?? null;
    const after = list[over.index] ?? null;
    void moveTask(dragging, status, before?.id ?? null, after?.id ?? null);
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
      <div className="flex gap-3">
        {columns.map((column) => (
          <section
            key={column.status}
            aria-label={STATUS_LABEL[column.status]}
            className={cn(
              "flex min-w-[16rem] flex-1 basis-0 snap-start flex-col rounded-lg bg-muted/50 p-2",
              over?.status === column.status && "ring-2 ring-primary/40"
            )}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              const cards = Array.from(
                (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-task-key]")
              ).filter((el) => el.dataset.taskKey !== dragging.key);
              const index = cards.findIndex((el) => {
                const rect = el.getBoundingClientRect();
                return event.clientY < rect.top + rect.height / 2;
              });
              setOver({ status: column.status, index: index === -1 ? cards.length : index });
            }}
            onDragLeave={(event) => {
              if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(column.status);
            }}
          >
            <header className="flex items-center gap-2 px-1 pb-2 pt-1 text-sm font-semibold">
              <StatusIcon status={column.status} />
              {STATUS_LABEL[column.status]}
              <span className="text-xs font-normal text-muted-foreground">{column.tasks.length}</span>
            </header>
            <div className="flex min-h-[3rem] flex-col gap-2">
              {column.tasks.map((task, index) => (
                <React.Fragment key={task.id}>
                  {over?.status === column.status && over.index === index && dragging ? (
                    <div className="h-1 rounded bg-primary" />
                  ) : null}
                  <TaskCard
                    task={task}
                    members={members}
                    tags={tags}
                    selected={selectedKey === task.key}
                    onOpen={() => openTask(task.key)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", task.key);
                      setDragging(task);
                    }}
                  />
                </React.Fragment>
              ))}
              {over?.status === column.status && over.index >= column.tasks.length && dragging ? (
                <div className="h-1 rounded bg-primary" />
              ) : null}
            </div>
            <QuickCreate status={column.status} onCreate={(title) => createTask({ title, status: column.status })} />
          </section>
        ))}
      </div>
    </div>
  );
}

function QuickCreate({ status, onCreate }: { status: TaskStatus; onCreate: (title: string) => Promise<unknown> }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="mt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const title = value.trim();
        if (!title || busy) return;
        setBusy(true);
        await onCreate(title);
        setValue("");
        setBusy(false);
      }}
    >
      <Input
        aria-label={`New task in ${STATUS_LABEL[status]}`}
        placeholder="+ New task"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 border-dashed bg-transparent text-sm"
      />
    </form>
  );
}
