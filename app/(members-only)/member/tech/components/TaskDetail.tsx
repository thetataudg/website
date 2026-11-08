"use client";

// One task: title, description, checklist and the activity timeline on the
// left; properties on the right. Used by the slide-over sheet and the
// full-page route alike.
import * as React from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bug,
  CalendarClock,
  ListTodo,
  FileText,
  History,
  Link2,
  Globe,
  ListChecks,
  Lock,
  Maximize2,
  Pencil,
  SignalHigh,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useLive } from "@/components/live/useLive";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/markdownSafe";
import { formatRef } from "@/lib/bugs/constants";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_GROUP,
  STATUS_LABEL,
  TASK_ZONE,
  type TaskStatus,
} from "@/lib/tasks/constants";
import type { ActivityDTO, RosterMember, TaskDTO, TrackerContext } from "@/lib/tasks/service";
import { Avatar, Tip, PriorityIcon, PriorityLabel, StaleChip, StatusIcon, StatusLabel, TagChip, TAG_DOT, useMemberMap, useTagMap } from "./bits";
import type { TagDTO } from "@/lib/tasks/service";
import { MultiSelect } from "./MultiSelect";
import { ActivitySkeleton, TaskDetailSkeleton } from "./Skeletons";
import { applyPatch } from "./optimistic";
import { readCache, trackSync, useCacheKey, useIsoLayoutEffect, writeCache } from "@/components/live/cachedFetch";
import { useTracker } from "./TrackerProvider";
import { BugPanel } from "./BugPanel";

type Detail = { task: TaskDTO; activity: ActivityDTO[]; context: TrackerContext };

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

const when = (iso: string) => {
  const dt = DateTime.fromISO(iso).setZone(TASK_ZONE);
  const days = Math.floor(DateTime.now().diff(dt, "days").days);
  return days < 1 ? dt.toFormat("h:mm a") : days < 300 ? dt.toFormat("LLL d") : dt.toFormat("LLL d, yyyy");
};

export function TaskDetail({ taskKey, inSheet = false }: { taskKey: string; inSheet?: boolean }) {
  const tracker = useTracker();
  const url = `/api/tasks/${encodeURIComponent(taskKey)}`;
  const cacheKey = useCacheKey(url);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  /// The timeline is still on its way (the task came from the board list).
  const [partial, setPartial] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Instant open: the cached detail, or the card's own data from the board
  // with the timeline filled in when the fetch lands.
  useIsoLayoutEffect(() => {
    setError(null);
    const cached = readCache<Detail>(cacheKey);
    if (cached) {
      setDetail(cached);
      setPartial(false);
      return;
    }
    const fromList = tracker.tasks.find((t) => t.key === taskKey);
    if (fromList && tracker.context) {
      setDetail({ task: fromList, activity: [], context: tracker.context });
      setPartial(true);
    } else {
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, taskKey]);

  const load = React.useCallback(async () => {
    if (!cacheKey) return;
    try {
      const next = await trackSync(fetch(url, { cache: "no-store" }).then(readJson));
      writeCache(cacheKey, next);
      setDetail(next);
      setPartial(false);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load the task");
    }
  }, [url, cacheKey]);
  React.useEffect(() => {
    void load();
  }, [load]);
  useLive("tasks", () => void load());

  /// Shows the change at once. The timeline catches up in the background;
  /// on an error the old values come back (the provider shows the toast).
  const patch = async (body: Record<string, unknown>) => {
    const previous = detail?.task;
    if (previous) setDetail((d) => (d ? { ...d, task: applyPatch(d.task, body) } : d));
    const updated = await tracker.patchTask(previous?.key || taskKey, body);
    if (updated) {
      setDetail((d) => (d ? { ...d, task: updated } : d));
      void load();
    } else if (previous) {
      setDetail((d) => (d ? { ...d, task: previous } : d));
    }
    return updated;
  };

  if (error && !detail) return <p className="p-2 text-sm text-destructive">{error === "Not found" ? "This task does not exist or you cannot see it." : error}</p>;
  if (!detail) return <TaskDetailSkeleton />;

  return <TaskDetailBody detail={detail} partial={partial} patch={patch} reload={load} inSheet={inSheet} />;
}

function TaskDetailBody({
  detail,
  partial,
  patch,
  reload,
  inSheet,
}: {
  detail: Detail;
  partial: boolean;
  patch: (body: Record<string, unknown>) => Promise<TaskDTO | null>;
  reload: () => Promise<void>;
  inSheet: boolean;
}) {
  const { task, activity, context } = detail;
  const tracker = useTracker();
  const members = useMemberMap(context.members);
  const tags = useTagMap(context.tags);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const fullHref = `/member/tech/${encodeURIComponent(task.key)}${
    tracker.committeeParam ? `?committee=${encodeURIComponent(tracker.committeeParam)}` : ""
  }`;


  const remove = async () => {
    try {
      await readJson(await fetch(`/api/tasks/${encodeURIComponent(task.key)}`, { method: "DELETE" }));
      toast.success(`${task.key} deleted`);
      tracker.openTask(null);
      void tracker.reload();
    } catch (err: any) {
      toast.error(err.message || "Could not delete");
    }
  };

  const properties = <Properties task={task} context={context} patch={patch} />;

  return (
    <div className={cn(inSheet ? "" : "flex flex-col gap-8 lg:flex-row lg:items-start")}>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "z-10 mb-4 flex items-center gap-2 border-b border-border bg-background/95 py-3 backdrop-blur",
            inSheet ? "sticky top-0 -mx-6 -mt-6 px-6" : ""
          )}
        >
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">{task.key}</span>
          {task.archivedAt ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">Archived</span> : null}
          <span className={cn("ml-auto flex gap-0.5", inSheet && "pr-8")}>
            <ShareMenu task={task} fullHref={fullHref} onChanged={reload} />
            {inSheet ? (
              <Tip label="Open as a full page">
              <Button variant="ghost" size="icon" aria-label="Open full page" asChild>
                <Link
                  href={fullHref}
                  onClick={(event) => {
                    // Plain click: swap the panel for the page. Cmd/Ctrl-click
                    // still opens a new tab and leaves the panel alone.
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    tracker.openTask(null);
                  }}
                >
                  <Maximize2 aria-hidden="true" />
                </Link>
              </Button>
              </Tip>
            ) : null}
            <Tip label={task.archivedAt ? "Restore from the archive" : "Archive"}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={task.archivedAt ? "Restore" : "Archive"}
              onClick={async () => {
                const archiving = !task.archivedAt;
                const done = await patch({ archived: archiving });
                if (done && archiving) {
                  toast.success(`${task.key} archived`, {
                    description: "Find it under the Archived tab.",
                    action: { label: "Undo", onClick: () => void patch({ archived: false }) },
                  });
                }
              }}
            >
              {task.archivedAt ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            </Button>
            </Tip>
            {context.viewer.canManage ? (
              <Tip label="Delete task">
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </Tip>
            ) : null}
          </span>
        </div>

        <TitleEditor title={task.title} onSave={(title) => patch({ title })} />
        {inSheet ? <div className="mt-4">{properties}</div> : null}

        <div className="mt-8 space-y-8">
          <Section title="Description" icon={FileText}>
            <DescriptionEditor description={task.description} onSave={(description) => patch({ description })} />
          </Section>
          <Checklist task={task} members={context.members} onSave={(checklist) => patch({ checklist })} />
          {task.bugReportId ? <BugPanel bugReportId={task.bugReportId} /> : null}
          <Timeline task={task} activity={activity} loading={partial} context={context} members={members} tags={tags} reload={reload} />
        </div>
      </div>

      {inSheet ? null : <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-80">{properties}</aside>}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {task.key}?</AlertDialogTitle>
            <AlertDialogDescription>
              The task and its timeline are removed for everyone. Archive it instead to keep the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------ layout

/// One heading style for every part of the task, so the page reads top to
/// bottom instead of as a stack of boxes.
export function Section({
  title,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="m-0 text-sm font-semibold text-foreground">{title}</h3>
        {aside ? <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ share

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Could not copy. The link is " + text);
  }
}

/// Copy link asks who it is for: members (the default, sign-in required) or
/// anyone with the link (a read-only public page that can be turned off).
function ShareMenu({ task, fullHref, onChanged }: { task: TaskDTO; fullHref: string; onChanged: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const publicUrl = (token: string) => `${window.location.origin}/t/${token}`;

  const setPublic = async (on: boolean) => {
    setBusy(true);
    try {
      const res = await readJson(
        await fetch(`/api/tasks/${encodeURIComponent(task.key)}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public: on }),
        })
      );
      if (on && res.shareToken) await copy(publicUrl(res.shareToken), "Public link copied");
      else toast.success("Public link turned off");
      setOpen(false);
      await onChanged();
    } catch (err: any) {
      toast.error(err.message || "Could not change sharing");
    } finally {
      setBusy(false);
    }
  };

  const option = (props: {
    icon: React.ReactNode;
    title: string;
    detail: string;
    onClick: () => void;
    tone?: string;
  }) => (
    <button
      type="button"
      disabled={busy}
      onClick={props.onClick}
      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left hover:bg-accent disabled:opacity-60"
    >
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", props.tone)}>
        {props.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{props.title}</span>
        <span className="block text-xs text-muted-foreground">{props.detail}</span>
      </span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip label={task.shareToken ? "Share (public link is on)" : "Share or copy link"}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Share" className={cn(task.shareToken && "text-sky-600 dark:text-sky-400")}>
          {task.shareToken ? <Globe aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-80 p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">Copy a link to {task.key}</p>
        {option({
          icon: <Lock className="size-4" aria-hidden="true" />,
          title: "Members only",
          detail: "Brothers on the tracker sign in to see it.",
          tone: "bg-muted text-foreground",
          onClick: async () => {
            await copy(`${window.location.origin}${fullHref}`, "Link copied");
            setOpen(false);
          },
        })}
        {task.shareToken ? (
          <>
            {option({
              icon: <Globe className="size-4" aria-hidden="true" />,
              title: "Copy public link",
              detail: "Anyone with it can read this task. No comments or history.",
              tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
              onClick: async () => {
                await copy(publicUrl(task.shareToken!), "Public link copied");
                setOpen(false);
              },
            })}
            <div className="mt-1 border-t border-border pt-1">
              <Button variant="ghost" size="sm" className="w-full justify-start text-destructive" disabled={busy} onClick={() => setPublic(false)}>
                <Lock aria-hidden="true" />
                Turn off the public link
              </Button>
            </div>
          </>
        ) : (
          option({
            icon: <Globe className="size-4" aria-hidden="true" />,
            title: "Anyone with the link",
            detail: "Makes a read-only public page. You can turn it off later.",
            tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
            onClick: () => setPublic(true),
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ title

function TitleEditor({ title, onSave }: { title: string; onSave: (title: string) => Promise<unknown> }) {
  const [value, setValue] = React.useState(title);
  React.useEffect(() => setValue(title), [title]);
  const commit = () => {
    const next = value.trim();
    if (next && next !== title) void onSave(next);
    else setValue(title);
  };
  return (
    <Input
      aria-label="Title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setValue(title);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="-mx-2 h-auto border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight shadow-none hover:bg-accent/50 focus-visible:border-input"
    />
  );
}

// ------------------------------------------------------------------ description

function DescriptionEditor({
  description,
  onSave,
}: {
  description: string;
  onSave: (description: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [value, setValue] = React.useState(description);
  React.useEffect(() => {
    if (!editing) setValue(description);
  }, [description, editing]);

  if (!editing) {
    return (
      <div className="group relative">
        {description ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit description"
            className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
          >
            <div
              className="tt-md break-words text-sm leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Add a description
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-sm">
        <Button variant={preview ? "ghost" : "secondary"} size="sm" onClick={() => setPreview(false)}>
          Write
        </Button>
        <Button variant={preview ? "secondary" : "ghost"} size="sm" onClick={() => setPreview(true)}>
          Preview
        </Button>
      </div>
      {preview ? (
        <div
          className="tt-md min-h-[8rem] break-words rounded-md border border-border p-3 text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<p>Nothing to preview.</p>" }}
        />
      ) : (
        <Textarea
          aria-label="Description"
          rows={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Markdown works here."
        />
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            void onSave(value);
            setEditing(false);
            setPreview(false);
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(description);
            setEditing(false);
            setPreview(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ checklist

type ChecklistItem = TaskDTO["checklist"][number];

function Checklist({
  task,
  members,
  onSave,
}: {
  task: TaskDTO;
  members: RosterMember[];
  onSave: (items: ChecklistItem[]) => Promise<unknown>;
}) {
  const [draft, setDraft] = React.useState("");
  const items = task.checklist;
  const memberMap = useMemberMap(members);
  const save = (next: ChecklistItem[]) =>
    onSave(next.map((i) => ({ id: i.id || undefined, text: i.text, done: i.done, assigneeId: i.assigneeId }) as any));

  const doneCount = items.filter((i) => i.done).length;
  return (
    <Section
      title="Checklist"
      icon={ListChecks}
      aside={
        items.length ? (
          <>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </span>
            <span className="tabular-nums">
              {doneCount}/{items.length}
            </span>
          </>
        ) : null
      }
    >
      <ul className="m-0 list-none space-y-0.5 p-0">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/60">
            <Checkbox
              checked={item.done}
              aria-label={item.text}
              onCheckedChange={(checked) =>
                save(items.map((i) => (i.id === item.id ? { ...i, done: checked === true } : i)))
              }
            />
            <span className={cn("min-w-0 flex-1 text-sm", item.done && "text-muted-foreground line-through")}>
              {item.text}
            </span>
            <MultiSelect
              single
              options={members.map((m) => ({ value: m.id, label: m.name }))}
              value={item.assigneeId ? [item.assigneeId] : []}
              onChange={(ids) => save(items.map((i) => (i.id === item.id ? { ...i, assigneeId: ids[0] ?? null } : i)))}
              searchPlaceholder="Assign to"
            >
              <button type="button" aria-label="Assign checklist item" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                {item.assigneeId ? <Avatar member={memberMap.get(item.assigneeId)} /> : <UserPlus className="size-4" aria-hidden="true" />}
              </button>
            </MultiSelect>
            <button
              type="button"
              aria-label="Remove item"
              className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              onClick={() => save(items.filter((i) => i.id !== item.id))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 rounded-md px-1 focus-within:bg-accent/40"
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          await save([...items, { id: "", text, done: false, assigneeId: null }]);
          setDraft("");
        }}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="New checklist item"
          placeholder="Add an item and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 border-transparent bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
        />
      </form>
    </Section>
  );
}

// ------------------------------------------------------------------ properties

function Properties({
  task,
  context,
  patch,
}: {
  task: TaskDTO;
  context: TrackerContext;
  patch: (body: Record<string, unknown>) => Promise<TaskDTO | null>;
}) {
  const tracker = useTracker();
  const members = useMemberMap(context.members);
  const tags = useTagMap(context.tags);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [priorityOpen, setPriorityOpen] = React.useState(false);
  const [assigneesOpen, setAssigneesOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const dueRef = React.useRef<HTMLDivElement>(null);

  // Keyboard shortcuts ask for a picker; open the matching one.
  const picker = tracker.picker;
  React.useEffect(() => {
    if (!picker) return;
    if (picker.field === "status") setStatusOpen(true);
    if (picker.field === "priority") setPriorityOpen(true);
    if (picker.field === "assignees") setAssigneesOpen(true);
    if (picker.field === "tags") setTagsOpen(true);
    if (picker.field === "due") dueRef.current?.querySelector("button")?.click();
  }, [picker]);

  const dueDate = task.dueAt ? DateTime.fromISO(task.dueAt).setZone(TASK_ZONE).toISODate() || "" : "";
  const dueTime = task.dueAt && !task.dueAllDay ? DateTime.fromISO(task.dueAt).setZone(TASK_ZONE).toFormat("HH:mm") : "";
  const setDue = (date: string, time: string) => {
    if (!date) return patch({ dueDate: null });
    if (!time) return patch({ dueDate: date });
    const at = DateTime.fromISO(`${date}T${time}`, { zone: TASK_ZONE }).toISO();
    return patch({ dueAt: at, dueAllDay: false });
  };

  const started = STATUS_GROUP[task.status] === "started" && task.statusChangedAt;
  const startedDays = started
    ? Math.floor(DateTime.now().diff(DateTime.fromISO(task.statusChangedAt!), "days").days)
    : 0;
  const creator = task.createdBy ? members.get(task.createdBy) : undefined;

  /// Linear-style property list: a label column and a quiet control that
  /// only shows a border on hover.
  const quiet = "h-8 w-full justify-start border-transparent bg-transparent px-2 font-normal shadow-none hover:bg-accent";
  const row = (label: string, Icon: React.ComponentType<{ className?: string }>, children: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem,1fr] items-center gap-2">
      <dt className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2">
      <dl className="m-0 space-y-0.5">
        {row(
          "Status",
          ListTodo,
          <Select open={statusOpen} onOpenChange={setStatusOpen} value={task.status} onValueChange={(status) => patch({ status })}>
            <SelectTrigger aria-label="Status" className={cn(quiet, "[&>svg:last-child]:hidden")}>
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
        )}
        {row(
          "Priority",
          SignalHigh,
          <Select open={priorityOpen} onOpenChange={setPriorityOpen} value={task.priority} onValueChange={(priority) => patch({ priority })}>
            <SelectTrigger aria-label="Priority" className={cn(quiet, "[&>svg:last-child]:hidden")}>
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
        )}
        {row(
          "Assignees",
          Users,
          <MultiSelect
            open={assigneesOpen}
            onOpenChange={setAssigneesOpen}
            options={context.members.map((m) => ({ value: m.id, label: m.name }))}
            value={task.assigneeIds}
            onChange={(assigneeIds) => patch({ assigneeIds })}
            searchPlaceholder="Assign to"
          >
            <Button variant="outline" className={cn(quiet, "h-auto min-h-8 py-1")}>
              {task.assigneeIds.length ? (
                <span className="flex flex-wrap gap-x-2 gap-y-1">
                  {task.assigneeIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 text-sm">
                      <Avatar member={members.get(id)} />
                      {members.get(id)?.name.split(" ")[0] || "Former member"}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </Button>
          </MultiSelect>
        )}
        {row(
          "Due",
          CalendarClock,
          <div className="flex gap-1" ref={dueRef}>
            <DatePicker
              value={dueDate}
              onChange={(date) => setDue(date, dueTime)}
              clearable
              placeholder="No due date"
              className={cn(quiet, "min-w-0 flex-1 [&>svg]:hidden")}
            />
            {dueDate ? (
              <TimePicker
                aria-label="Due time"
                value={dueTime}
                onChange={(time) => setDue(dueDate, time)}
                placeholder="Any time"
                className={cn(quiet, "w-auto shrink-0 text-muted-foreground [&>svg]:hidden")}
              />
            ) : null}
          </div>
        )}
        {row(
          "Tags",
          Tag,
          <MultiSelect
            open={tagsOpen}
            onOpenChange={setTagsOpen}
            options={context.tags.map((t) => ({
              value: t.id,
              label: t.name,
              leading: <span className={cn("size-2 rounded-full", TAG_DOT[t.color] || TAG_DOT.gray)} />,
            }))}
            value={task.tagIds}
            onChange={(tagIds) => patch({ tagIds })}
            onCreate={tracker.createTag}
            searchPlaceholder="Find or create a tag"
          >
            <Button variant="outline" className={cn(quiet, "h-auto min-h-8 py-1")}>
              {task.tagIds.length ? (
                <span className="flex flex-wrap gap-1">
                  {task.tagIds.map((id) => {
                    const tag = tags.get(id);
                    return tag ? <TagChip key={id} tag={tag} /> : null;
                  })}
                </span>
              ) : (
                <span className="text-muted-foreground">No tags</span>
              )}
            </Button>
          </MultiSelect>
        )}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-1 pt-2 text-xs text-muted-foreground">
        <span>
          {task.createdBy ? `Created by ${creator?.name || "a former member"}` : "Filed automatically"},{" "}
          {DateTime.fromISO(task.createdAt).setZone(TASK_ZONE).toFormat("LLL d")}
        </span>
        {started ? (
          <span>
            {STATUS_LABEL[task.status]} for {startedDays} {startedDays === 1 ? "day" : "days"}
          </span>
        ) : null}
        <StaleChip task={task} />
        {task.autoSorted ? (
          <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Sorted automatically
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ timeline

type Tone = "primary" | "green" | "red" | "amber" | "sky" | "violet" | "gray";
/// Literal classes so Tailwind keeps them. The icon sits in a soft tinted dot.
const TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  gray: "bg-muted text-muted-foreground",
};
const STATUS_TONE: Record<TaskStatus, Tone> = {
  backlog: "gray",
  todo: "gray",
  in_progress: "amber",
  in_review: "sky",
  done: "green",
  canceled: "gray",
};

const Strong = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("font-medium text-foreground", className)}>{children}</span>
);
const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{children}</span>
);
const list = (items: React.ReactNode[]) =>
  items.map((item, i) => (
    <React.Fragment key={i}>
      {i ? ", " : null}
      {item}
    </React.Fragment>
  ));

function describe(
  a: ActivityDTO,
  members: Map<string, RosterMember>,
  tags: Map<string, TagDTO>
): { tone: Tone; icon: React.ReactNode; text: React.ReactNode } {
  const name = (id: string) => members.get(id)?.name || "a former member";
  const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const icon = (Icon: React.ComponentType<{ className?: string }>) => <Icon className="size-3.5" />;
  switch (a.kind) {
    case "created":
      return { tone: "primary", icon: icon(Plus), text: "created the task" };
    case "status": {
      const to = a.to as TaskStatus;
      return {
        tone: STATUS_TONE[to] ?? "gray",
        icon: <StatusIcon status={to} className="size-3.5 text-current" />,
        text: (
          <>
            moved this{" "}
            <Pill>
              <StatusIcon status={a.from as TaskStatus} className="size-3" />
              {STATUS_LABEL[a.from as TaskStatus] ?? String(a.from)}
            </Pill>{" "}
            <ArrowRight className="inline size-3 align-middle" aria-label="to" />{" "}
            <Pill>
              <StatusIcon status={to} className="size-3" />
              {STATUS_LABEL[to] ?? String(a.to)}
            </Pill>
          </>
        ),
      };
    }
    case "priority": {
      const p = a.to as keyof typeof PRIORITY_LABEL;
      const tone: Tone = p === "urgent" ? "red" : p === "high" ? "amber" : p === "medium" ? "sky" : "gray";
      return {
        tone,
        icon: <PriorityIcon priority={p} className="size-3.5 text-current" />,
        text: (
          <>
            set priority to <Strong>{PRIORITY_LABEL[p] ?? String(a.to)}</Strong>
          </>
        ),
      };
    }
    case "assignees": {
      const before = ids(a.from);
      const after = ids(a.to);
      const added = after.filter((id) => !before.includes(id));
      const removed = before.filter((id) => !after.includes(id));
      const addedEls = added.map((id) => <Strong key={id} className="text-emerald-700 dark:text-emerald-300">{name(id)}</Strong>);
      const removedEls = removed.map((id) => <Strong key={id} className="text-red-700 line-through dark:text-red-300">{name(id)}</Strong>);
      if (added.length && removed.length) {
        return { tone: "sky", icon: icon(UserPlus), text: <>reassigned from {list(removedEls)} to {list(addedEls)}</> };
      }
      if (added.length) return { tone: "green", icon: icon(UserPlus), text: <>assigned {list(addedEls)}</> };
      return { tone: "red", icon: icon(UserMinus), text: <>unassigned {list(removedEls)}</> };
    }
    case "due": {
      const to = a.to as { at: string; allDay: boolean } | null;
      if (!to) return { tone: "gray", icon: icon(CalendarClock), text: "removed the due date" };
      const dt = DateTime.fromISO(to.at).setZone(TASK_ZONE);
      return {
        tone: "amber",
        icon: icon(CalendarClock),
        text: (
          <>
            set the due date to <Strong>{to.allDay ? dt.toFormat("LLL d") : dt.toFormat("LLL d, h:mm a")}</Strong>
          </>
        ),
      };
    }
    case "tags": {
      const before = ids(a.from);
      const after = ids(a.to);
      const chip = (id: string, removed = false) => {
        const tag = tags.get(id);
        return (
          <span key={id} className={cn(removed && "line-through opacity-60")}>
            {tag ? <TagChip tag={tag} /> : "a tag"}
          </span>
        );
      };
      const added = after.filter((id) => !before.includes(id));
      const removed = before.filter((id) => !after.includes(id));
      return {
        tone: removed.length && !added.length ? "red" : "violet",
        icon: icon(Tag),
        text: (
          <>
            {added.length ? <>added {list(added.map((id) => chip(id)))}</> : null}
            {added.length && removed.length ? " and " : null}
            {removed.length ? <>removed {list(removed.map((id) => chip(id, true)))}</> : null}
            {!added.length && !removed.length ? "changed the tags" : null}
          </>
        ),
      };
    }
    case "title":
      return { tone: "sky", icon: icon(Pencil), text: <>renamed this to <Strong>{String(a.to)}</Strong></> };
    case "description":
      return { tone: "sky", icon: icon(FileText), text: "updated the description" };
    case "checklist": {
      const to = a.to as { done: number; total: number } | null;
      return {
        tone: "violet",
        icon: icon(ListChecks),
        text: to ? <>updated the checklist (<Strong>{to.done}/{to.total}</Strong> done)</> : "updated the checklist",
      };
    }
    case "linked_bug":
      return { tone: "red", icon: icon(Bug), text: "created this from a bug report" };
    case "archived":
      return a.to
        ? { tone: "gray", icon: icon(Archive), text: "archived this" }
        : { tone: "green", icon: icon(ArchiveRestore), text: "restored this" };
    case "shared":
      return a.to
        ? { tone: "sky", icon: icon(Globe), text: "turned on the public link" }
        : { tone: "gray", icon: icon(Lock), text: "turned off the public link" };
    case "auto_sorted":
      return {
        tone: "violet",
        icon: icon(Sparkles),
        // Lines written before report numbers changed say "R-1".
        text: String(a.body || "sorted this automatically").replace(/\bR-(\d+)\b/g, (_m, n) => formatRef(Number(n))),
      };
    default:
      return { tone: "gray", icon: icon(Pencil), text: "updated this" };
  }
}

function Timeline({
  task,
  activity,
  loading,
  context,
  members,
  tags,
  reload,
}: {
  task: TaskDTO;
  activity: ActivityDTO[];
  loading: boolean;
  context: TrackerContext;
  members: Map<string, RosterMember>;
  tags: Map<string, TagDTO>;
  reload: () => Promise<void>;
}) {
  const viewer = members.get(context.viewer.id);
  /// Comments on their way to the server, shown right away.
  const [pending, setPending] = React.useState<{ id: string; body: string }[]>([]);
  const postComment = async (body: string) => {
    const id = `pending-${Date.now()}`;
    setPending((list) => [...list, { id, body }]);
    try {
      const res = await trackSync(
        fetch(`/api/tasks/${encodeURIComponent(task.key)}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        })
      );
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || "Could not post the comment");
        return false;
      }
      await reload();
      return true;
    } finally {
      setPending((list) => list.filter((p) => p.id !== id));
    }
  };

  return (
    <Section title="Activity" icon={History}>
      {loading ? <ActivitySkeleton /> : null}
      <ol className="relative m-0 list-none space-y-2.5 p-0 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border">
        {activity.map((a) => {
          if (a.kind === "comment") {
            return <Comment key={a.id} taskKey={task.key} comment={a} context={context} members={members} reload={reload} />;
          }
          const d = describe(a, members, tags);
          return (
            <li key={a.id} className="relative flex items-start gap-2.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "relative z-10 mt-px flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-background",
                  TONE[d.tone]
                )}
                aria-hidden="true"
              >
                {d.icon}
              </span>
              <p className="m-0 min-w-0 flex-1 pt-1 text-xs leading-relaxed">
                <span className="font-semibold text-foreground">{a.actorName}</span> {d.text}
              </p>
              <span className="shrink-0 pt-1 text-[11px] tabular-nums">{when(a.createdAt)}</span>
            </li>
          );
        })}
      </ol>
      {pending.length ? (
        <ol className="m-0 -mt-1 list-none space-y-2.5 p-0" aria-live="polite">
          {pending.map((p) => (
            <li key={p.id} className="flex items-start gap-2.5 opacity-70">
              <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center">
                <Avatar member={viewer} />
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-card px-3 py-2">
                <p className="m-0 mb-1 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">{viewer?.name || "You"}</span>
                  <span className="text-muted-foreground">Sending</span>
                </p>
                <div className="tt-md break-words text-sm text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center">
          <Avatar member={viewer} />
        </span>
        <div className="min-w-0 flex-1">
          <Composer taskKey={task.key} members={context.members} onPosted={() => undefined} post={postComment} />
        </div>
      </div>
    </Section>
  );
}

function Comment({
  taskKey,
  comment,
  context,
  members,
  reload,
}: {
  taskKey: string;
  comment: ActivityDTO;
  context: TrackerContext;
  members: Map<string, RosterMember>;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const decoded = React.useMemo(() => decodeMentions(comment.body), [comment.body]);
  const [value, setValue] = React.useState(decoded.text);
  const mine = comment.actorId === context.viewer.id;
  const base = `/api/tasks/${encodeURIComponent(taskKey)}/comments/${comment.id}`;

  if (comment.deleted) {
    return (
      <li className="relative flex items-center gap-2.5 text-xs italic text-muted-foreground">
        <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted ring-4 ring-background" aria-hidden="true">
          <Trash2 className="size-3" />
        </span>
        Comment deleted
      </li>
    );
  }
  return (
    <li className="group relative flex items-start gap-2.5">
      <span className="relative z-10 mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-background">
        <Avatar member={comment.actorId ? members.get(comment.actorId) : undefined} />
      </span>
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-semibold text-foreground">{comment.actorName}</span>
        <span className="text-muted-foreground">
          {when(comment.createdAt)}
          {comment.editedAt ? " (edited)" : ""}
        </span>
        {mine || context.viewer.canManage ? (
          <span className="ml-auto flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {mine ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setValue(decoded.text);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              onClick={async () => {
                const res = await fetch(base, { method: "DELETE" });
                if (!res.ok) toast.error("Could not delete the comment");
                await reload();
              }}
            >
              Delete
            </button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label="Edit comment" value={value} onChange={(e) => setValue(e.target.value)} rows={3} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const res = await fetch(base, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ body: encodeMentions(value, decoded.picked) }),
                });
                if (!res.ok) toast.error("Could not save the comment");
                setEditing(false);
                await reload();
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="tt-md break-words text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
        />
      )}
      </div>
    </li>
  );
}

/// Mentions are stored as `@[Name](id)` but typed and shown as `@Name`.
/// `decodeMentions` turns stored text into what the box shows plus the
/// name-to-id map; `encodeMentions` turns it back on save.
export function decodeMentions(body: string): { text: string; picked: Map<string, string> } {
  const picked = new Map<string, string>();
  const text = (body || "").replace(/@\[([^\]]{1,80})\]\(([a-f0-9]{24})\)/gi, (_m, name: string, id: string) => {
    picked.set(name, id);
    return `@${name}`;
  });
  return { text, picked };
}

export function encodeMentions(text: string, picked: Map<string, string>): string {
  let out = text;
  const names = Array.from(picked.keys()).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const pattern = new RegExp(`(^|[^\\w\\[])@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "g");
    out = out.replace(pattern, (_m, lead: string) => `${lead}@[${name}](${picked.get(name)})`);
  }
  return out;
}

/// `text` with every picked `@Name` wrapped in a blue chip, for the
/// composer's backdrop.
function highlightMentions(text: string, picked: Map<string, string>): React.ReactNode {
  const names = Array.from(picked.keys()).sort((a, b) => b.length - a.length);
  if (!names.length || !text) return text;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))(?![\\w])`, "g");
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="rounded bg-sky-500/15 text-sky-700 dark:text-sky-300">
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

/// Textarea with @mention suggestions. Picking one inserts `@Name`; the
/// stored comment carries `@[Name](id)` so it renders as a profile link.
export function Composer({
  taskKey,
  members,
  onPosted,
  post,
  placeholder = "Leave a comment. Type @ to mention someone.",
  submitLabel = "Comment",
  extra,
}: {
  taskKey?: string;
  members: RosterMember[];
  onPosted: () => Promise<void> | void;
  /// Overrides the default "comment on this task" request.
  post?: (body: string) => Promise<boolean>;
  placeholder?: string;
  submitLabel?: string;
  extra?: React.ReactNode;
}) {
  const [value, setValue] = React.useState("");
  const [mention, setMention] = React.useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = React.useState(0);
  const picked = React.useRef(new Map<string, string>());
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  const suggestions = mention
    ? members.filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  const onChange = (next: string) => {
    setValue(next);
    const caret = ref.current?.selectionStart ?? next.length;
    const match = /(^|\s)@([\w.'-]{0,30})$/.exec(next.slice(0, caret));
    setMention(match ? { query: match[2], start: caret - match[2].length - 1 } : null);
    setActive(0);
  };

  const insert = (member: RosterMember) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? value.length;
    picked.current.set(member.name, member.id);
    const token = `@${member.name} `;
    const next = value.slice(0, mention.start) + token + value.slice(caret);
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + token.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  /// The box clears the moment you send; if the send fails, your text comes
  /// back so nothing is lost.
  const submit = async () => {
    const body = encodeMentions(value.trim(), picked.current);
    if (!body) return;
    const draft = value;
    const draftPicked = new Map(picked.current);
    setValue("");
    setMention(null);
    picked.current = new Map();
    let ok = true;
    try {
      if (post) ok = await post(body);
      else {
        const res = await trackSync(
          fetch(`/api/tasks/${encodeURIComponent(taskKey!)}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          })
        );
        ok = res.ok;
        if (!ok) toast.error((await res.json().catch(() => ({}))).error || "Could not post");
      }
    } catch {
      ok = false;
      toast.error("Could not post. Check your connection.");
    }
    if (ok) void onPosted();
    else {
      setValue((current) => current || draft);
      picked.current = draftPicked;
    }
  };

  return (
    <div className="relative space-y-2">
      {/* The textarea's own text is transparent; this copy behind it draws
          the same text with picked @mentions in blue. */}
      <div className="relative rounded-md bg-background">
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm text-foreground"
        >
          {highlightMentions(value, picked.current)}
          {"\n"}
        </div>
      <Textarea
          ref={ref}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
          }}
          className="relative bg-transparent text-transparent caret-foreground selection:bg-sky-500/25 selection:text-transparent"
          aria-label={placeholder}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (mention && suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + suggestions.length) % suggestions.length);
            } else if (mention && suggestions.length && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              insert(suggestions[Math.min(active, suggestions.length - 1)]);
            } else if (e.key === "Escape" && mention) {
              e.stopPropagation();
              setMention(null);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      {mention && suggestions.length ? (
        <ul className="absolute left-2 top-[5.5rem] z-20 w-56 list-none rounded-md border border-border bg-popover p-1 shadow-md">
          {suggestions.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                  i === active && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(m);
                }}
              >
                <Avatar member={m} />
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {extra}
        <Button size="sm" className="ml-auto" onClick={submit} disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
