"use client";

// The tracker's frame: header, view tabs, search, filters, the New task
// dialog, the task sheet and the shortcut sheet. Each view renders inside.
import { TrackerSkeleton } from "./Skeletons";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Keyboard, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useSyncing } from "@/components/live/cachedFetch";
import { PageContainer } from "../../../components/shell/PageShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/constants";
import { PriorityIcon, PriorityLabel, StatusLabel, TAG_DOT, Tip } from "./bits";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MultiSelect } from "./MultiSelect";
import { EMPTY_FILTERS, useTracker } from "./TrackerProvider";
import { TaskDetail } from "./TaskDetail";

const ALL = "__all";

/// Every view shares one wide frame so switching tabs never shifts the
/// header; the board needs the width for its six columns.
const CONTAINER = "max-w-[120rem] lg:px-8 2xl:px-12";

export function TrackerChrome({ children }: { children: React.ReactNode }) {
  const tracker = useTracker();
  const pathname = usePathname();
  const { context, error, loading } = tracker;

  if (loading && !context) {
    return (
      <PageContainer className={CONTAINER}>
        <TrackerSkeleton view={pathname.endsWith("/board") ? "board" : "rows"} />
      </PageContainer>
    );
  }
  if (error && !context) {
    return (
      <PageContainer className={CONTAINER}>
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {error === "Not found" ? "You are not on this committee's tracker." : error}
        </p>
      </PageContainer>
    );
  }
  if (!context) return null;

  const isTech = !tracker.committeeParam || context.committee.id === tracker.committeeParam;
  const tabs = [
    { href: "/member/tech/mine", label: "My tasks" },
    { href: "/member/tech/board", label: "Board" },
    { href: "/member/tech/list", label: "List" },
    { href: "/member/tech/calendar", label: "Calendar" },
    ...(context.viewer.canManage ? [{ href: "/member/tech/team", label: "Team" }] : []),
    ...(isTech ? [{ href: "/member/tech/triage", label: "Triage" }] : []),
    { href: "/member/tech/archived", label: "Archived" },
  ];
  const filtered = JSON.stringify({ ...tracker.filters, q: "" }) !== JSON.stringify({ ...EMPTY_FILTERS, q: "" });

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={150}>
    <PageContainer className={cn(CONTAINER, "space-y-4")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {context.committee.prefix}
          </p>
          <h1 className="m-0 flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {context.committee.name}
            <SyncPill />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Tip label="Keyboard shortcuts" shortcut="?">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Keyboard shortcuts"
              onClick={() => tracker.setShowShortcuts(true)}
              className="hidden sm:inline-flex"
            >
              <Keyboard aria-hidden="true" />
            </Button>
          </Tip>
          {context.viewer.canManage ? <AutoSortButton /> : null}
          <Tip label="New task" shortcut="C">
          <Button onClick={() => tracker.setNewTask({})}>
            <Plus aria-hidden="true" />
            New task
          </Button>
          </Tip>
        </div>
      </div>

      <nav aria-label="Tracker views" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="m-0 flex min-w-max list-none gap-1 border-b border-border p-0">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tracker.hrefFor(tab.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-block rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:bg-accent",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {pathname.endsWith("/team") || pathname.endsWith("/triage") || pathname.endsWith("/archived") || !tabs.some((t) => t.href === pathname) ? null : (
        <FilterBar filtered={filtered} />
      )}

      {children}

      <NewTaskDialog />
      <Sheet open={Boolean(tracker.openKey)} onOpenChange={(open) => !open && tracker.openTask(null)}>
        <SheetContent
          data-task-sheet=""
          side="right"
          className="w-full overflow-y-auto outline-none sm:max-w-2xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetTitle className="sr-only">{tracker.openKey || "Task"}</SheetTitle>
          {tracker.openKey ? <TaskDetail taskKey={tracker.openKey} inSheet /> : null}
        </SheetContent>
      </Sheet>
      <ShortcutsDialog />
    </PageContainer>
    </TooltipProvider>
  );
}

/// A thin bar across the top of the window and a quiet pill by the title
/// while fresh data loads behind what is already on screen.
function SyncPill() {
  const syncing = useSyncing();
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-300",
          syncing ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="tt-sync-bar block h-full w-1/3 bg-primary" />
      </span>
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-opacity duration-300",
          syncing ? "opacity-100" : "opacity-0"
        )}
      >
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        {syncing ? "Syncing" : ""}
      </span>
    </>
  );
}

function AutoSortButton() {
  const { committeeParam, reload } = useTracker();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/autosort${committeeParam ? `?committee=${encodeURIComponent(committeeParam)}` : ""}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not auto-sort");
      toast.success(json.sorted ? `Sorted ${json.sorted} ${json.sorted === 1 ? "task" : "tasks"}` : "Nothing needed sorting");
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tip label="Tag and prioritize open tasks that have no tags">
    <Button variant="outline" onClick={run} loading={busy} disabled={busy}>
      <Sparkles aria-hidden="true" />
      <span className="hidden sm:inline">Auto-sort</span>
    </Button>
    </Tip>
  );
}

function FilterBar({ filtered }: { filtered: boolean }) {
  const { filters, setFilters, context, searchRef } = useTracker();
  if (!context) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={searchRef}
          aria-label="Search tasks"
          placeholder="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLInputElement).blur()}
          className="h-9 pl-8"
        />
      </div>
      <MultiSelect
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        value={filters.status}
        onChange={(status) => setFilters((f) => ({ ...f, status: status as TaskStatus[] }))}
        searchPlaceholder="Status"
      >
        <Button variant="outline" size="sm" className={cn(filters.status.length && "border-primary")}>
          Status{filters.status.length ? ` (${filters.status.length})` : ""}
        </Button>
      </MultiSelect>
      <MultiSelect
        single
        options={[
          { value: "none", label: "Unassigned" },
          ...context.members.map((m) => ({ value: m.id, label: m.name })),
        ]}
        value={filters.assignee ? [filters.assignee] : []}
        onChange={(ids) => setFilters((f) => ({ ...f, assignee: ids[0] ?? null }))}
        searchPlaceholder="Assignee"
      >
        <Button variant="outline" size="sm" className={cn(filters.assignee && "border-primary")}>
          {filters.assignee === "none"
            ? "Unassigned"
            : filters.assignee
              ? context.members.find((m) => m.id === filters.assignee)?.name || "Assignee"
              : "Assignee"}
        </Button>
      </MultiSelect>
      <MultiSelect
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        value={filters.priority}
        onChange={(priority) => setFilters((f) => ({ ...f, priority: priority as TaskPriority[] }))}
        searchPlaceholder="Priority"
      >
        <Button variant="outline" size="sm" className={cn(filters.priority.length && "border-primary")}>
          Priority{filters.priority.length ? ` (${filters.priority.length})` : ""}
        </Button>
      </MultiSelect>
      {context.tags.length ? (
        <MultiSelect
          single
          options={context.tags.map((t) => ({ value: t.id, label: t.name }))}
          value={filters.tag ? [filters.tag] : []}
          onChange={(ids) => setFilters((f) => ({ ...f, tag: ids[0] ?? null }))}
          searchPlaceholder="Tag"
        >
          <Button variant="outline" size="sm" className={cn(filters.tag && "border-primary")}>
            {filters.tag ? context.tags.find((t) => t.id === filters.tag)?.name || "Tag" : "Tag"}
          </Button>
        </MultiSelect>
      ) : null}
      <Select
        value={filters.due ?? ALL}
        onValueChange={(v) => setFilters((f) => ({ ...f, due: v === ALL ? null : (v as any) }))}
      >
        <SelectTrigger aria-label="Due" className={cn("h-9 w-auto gap-2", filters.due && "border-primary")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any due date</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="week">Due this week</SelectItem>
          <SelectItem value="none">No due date</SelectItem>
        </SelectContent>
      </Select>
      {filtered ? (
        <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))}>
          <X aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function NewTaskDialog() {
  const { newTask, setNewTask, createTask, context, createTag, openTask, committeeParam } = useTracker();
  const empty = {
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "none" as TaskPriority,
    assigneeIds: [] as string[],
    tagIds: [] as string[],
    dueDate: "",
  };
  const [form, setForm] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (newTask) setForm({ ...empty, status: newTask.status ?? "todo" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTask]);
  const suggestion = useSuggestions(Boolean(newTask), form.title, form.description, committeeParam);
  if (!context) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    const task = await createTask({ ...form, dueDate: form.dueDate || null });
    setBusy(false);
    if (task) {
      setNewTask(null);
      openTask(task.key);
    }
  };

  return (
    <Dialog open={Boolean(newTask)} onOpenChange={(open) => !open && setNewTask(null)}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">Create a task on {context.committee.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-task-title">Title</Label>
            <Input
              id="new-task-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-task-desc">Description</Label>
            <Textarea
              id="new-task-desc"
              rows={4}
              value={form.description}
              placeholder="Markdown works here."
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(status) => setForm((f) => ({ ...f, status: status as TaskStatus }))}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <StatusLabel status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(priority) => setForm((f) => ({ ...f, priority: priority as TaskPriority }))}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <PriorityLabel priority={p} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignees</Label>
              <MultiSelect
                options={context.members.map((m) => ({ value: m.id, label: m.name }))}
                value={form.assigneeIds}
                onChange={(assigneeIds) => setForm((f) => ({ ...f, assigneeIds }))}
                searchPlaceholder="Assign to"
              >
                <Button type="button" variant="outline" className="w-full justify-start font-normal">
                  {form.assigneeIds.length
                    ? form.assigneeIds.map((id) => context.members.find((m) => m.id === id)?.name.split(" ")[0]).join(", ")
                    : "Unassigned"}
                </Button>
              </MultiSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Due</Label>
              <DatePicker value={form.dueDate} onChange={(dueDate) => setForm((f) => ({ ...f, dueDate }))} clearable placeholder="No due date" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tags</Label>
              <MultiSelect
                options={context.tags.map((t) => ({
                  value: t.id,
                  label: t.name,
                  leading: <span className={cn("size-2 rounded-full", TAG_DOT[t.color] || TAG_DOT.gray)} />,
                }))}
                value={form.tagIds}
                onChange={(tagIds) => setForm((f) => ({ ...f, tagIds }))}
                onCreate={createTag}
                searchPlaceholder="Find or create a tag"
              >
                <Button type="button" variant="outline" className="w-full justify-start font-normal">
                  {form.tagIds.length
                    ? form.tagIds.map((id) => context.tags.find((t) => t.id === id)?.name).filter(Boolean).join(", ")
                    : "No tags"}
                </Button>
              </MultiSelect>
              <Suggestions
                state={suggestion}
                tags={context.tags}
                selectedTagIds={form.tagIds}
                priority={form.priority}
                onAddTag={(id) => setForm((f) => (f.tagIds.includes(id) ? f : { ...f, tagIds: [...f.tagIds, id] }))}
                onCreateTag={async (name) => {
                  const id = await createTag(name);
                  if (id) setForm((f) => (f.tagIds.includes(id) ? f : { ...f, tagIds: [...f.tagIds, id] }));
                }}
                onPriority={(priority) => setForm((f) => ({ ...f, priority }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setNewTask(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.title.trim()} loading={busy}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ suggestions

type SuggestionState = {
  loading: boolean;
  tagIds: string[];
  newTag: string | null;
  priority: TaskPriority | null;
};

/// Asks for tag and priority ideas once the writer pauses for a moment.
function useSuggestions(open: boolean, title: string, description: string, committeeId: string | null): SuggestionState {
  const [state, setState] = React.useState<SuggestionState>({ loading: false, tagIds: [], newTag: null, priority: null });
  const text = `${title.trim()}\n${description.trim()}`;
  React.useEffect(() => {
    if (!open || title.trim().length < 4) {
      setState({ loading: false, tagIds: [], newTag: null, priority: null });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetch("/api/tasks/suggest", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ committeeId, title: title.trim(), description: description.trim() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error();
        setState({ loading: false, tagIds: json.tagIds || [], newTag: json.newTag || null, priority: json.priority || null });
      } catch (err: any) {
        if (err?.name !== "AbortError") setState((s) => ({ ...s, loading: false }));
      }
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, committeeId]);
  return state;
}

function Suggestions({
  state,
  tags,
  selectedTagIds,
  priority,
  onAddTag,
  onCreateTag,
  onPriority,
}: {
  state: SuggestionState;
  tags: { id: string; name: string; color: string }[];
  selectedTagIds: string[];
  priority: TaskPriority;
  onAddTag: (id: string) => void;
  onCreateTag: (name: string) => Promise<void>;
  onPriority: (priority: TaskPriority) => void;
}) {
  const tagIds = state.tagIds.filter((id) => !selectedTagIds.includes(id) && tags.some((t) => t.id === id));
  const newTag = state.newTag && !tags.some((t) => t.name.toLowerCase() === state.newTag!.toLowerCase()) ? state.newTag : null;
  const showPriority = state.priority && priority === "none" ? state.priority : null;
  const any = tagIds.length || newTag || showPriority;
  if (!state.loading && !any) return null;

  const chip =
    "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-violet-400/70 bg-violet-500/5 px-2.5 text-xs font-medium text-violet-800 transition-colors hover:border-solid hover:bg-violet-500/15 dark:text-violet-200";
  const addAll = async () => {
    tagIds.forEach(onAddTag);
    if (showPriority) onPriority(showPriority);
    if (newTag && !tagIds.length) await onCreateTag(newTag);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-live="polite">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {state.loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5 text-violet-600 dark:text-violet-300" aria-hidden="true" />}
        {state.loading && !any ? "Finding tags" : "Suggested"}
      </span>
      {tagIds.map((id) => {
        const tag = tags.find((t) => t.id === id)!;
        return (
          <button key={id} type="button" className={chip} onClick={() => onAddTag(id)} aria-label={`Add tag ${tag.name}`}>
            <Plus className="size-3" aria-hidden="true" />
            {tag.name}
          </button>
        );
      })}
      {newTag ? (
        <button type="button" className={chip} onClick={() => onCreateTag(newTag)} aria-label={`Create and add tag ${newTag}`}>
          <Plus className="size-3" aria-hidden="true" />
          {newTag}
          <span className="text-[10px] font-normal opacity-70">new</span>
        </button>
      ) : null}
      {showPriority ? (
        <button type="button" className={chip} onClick={() => onPriority(showPriority)} aria-label={`Set priority to ${PRIORITY_LABEL[showPriority]}`}>
          <PriorityIcon priority={showPriority} className="size-3.5" />
          {PRIORITY_LABEL[showPriority]}
        </button>
      ) : null}
      {any && (tagIds.length + (newTag ? 1 : 0) + (showPriority ? 1 : 0)) > 1 ? (
        <button type="button" onClick={addAll} className="h-7 px-1.5 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
          Add all
        </button>
      ) : null}
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["C", "New task"],
  ["/", "Search"],
  ["J / K", "Move selection"],
  ["Enter", "Open selected task"],
  ["S", "Status"],
  ["P", "Priority"],
  ["A", "Assignees"],
  ["D", "Due date"],
  ["L", "Tags"],
  ["Esc", "Close"],
  ["?", "This list"],
];

function ShortcutsDialog() {
  const { showShortcuts, setShowShortcuts } = useTracker();
  return (
    <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">Shortcuts for the task tracker.</DialogDescription>
        </DialogHeader>
        <dl className="m-0 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([key, label]) => (
            <React.Fragment key={key}>
              <dt>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
              </dt>
              <dd className="m-0 text-muted-foreground">{label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
