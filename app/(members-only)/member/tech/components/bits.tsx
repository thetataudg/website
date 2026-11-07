"use client";

// Small presentational pieces shared by every tracker view. Icons are
// borderless lucide glyphs only (no circle or square enclosed variants).
import * as React from "react";
import {
  Calendar,
  Check,
  Eye,
  Flame,
  Hourglass,
  Inbox,
  ListTodo,
  Minus,
  Play,
  SignalHigh,
  SignalLow,
  SignalMedium,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/constants";
import type { RosterMember, TagDTO, TaskDTO } from "@/lib/tasks/service";

/// A quick, quiet tooltip for icons and anything whose meaning isn't
/// written out. Needs the TooltipProvider in TrackerChrome.
export function Tip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: React.ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2 bg-foreground px-2 py-1 text-[11px] font-medium text-background">
        {label}
        {shortcut ? (
          <kbd className="rounded bg-background/20 px-1 font-mono text-[10px] leading-4">{shortcut}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const props = { className: cn("size-4 shrink-0", className), "aria-hidden": true } as const;
  switch (status) {
    case "backlog":
      return <Inbox {...props} className={cn(props.className, "text-muted-foreground")} />;
    case "todo":
      return <ListTodo {...props} className={cn(props.className, "text-foreground/70")} />;
    case "in_progress":
      return <Play {...props} className={cn(props.className, "text-amber-600 dark:text-amber-400")} />;
    case "in_review":
      return <Eye {...props} className={cn(props.className, "text-sky-600 dark:text-sky-400")} />;
    case "done":
      return <Check {...props} className={cn(props.className, "text-emerald-600 dark:text-emerald-400")} />;
    case "canceled":
      return <X {...props} className={cn(props.className, "text-muted-foreground")} />;
  }
}

export function StatusLabel({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const base = cn("size-4 shrink-0", className);
  const label = PRIORITY_LABEL[priority];
  switch (priority) {
    case "urgent":
      return <Flame className={cn(base, "fill-red-600 text-red-600 dark:fill-red-500 dark:text-red-500")} aria-label={label} />;
    case "high":
      return <SignalHigh className={cn(base, "text-foreground")} aria-label={label} />;
    case "medium":
      return <SignalMedium className={cn(base, "text-foreground/80")} aria-label={label} />;
    case "low":
      return <SignalLow className={cn(base, "text-muted-foreground")} aria-label={label} />;
    default:
      return <Minus className={cn(base, "text-muted-foreground/60")} aria-label={label} />;
  }
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PriorityIcon priority={priority} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/// Literal class strings so Tailwind keeps them.
export const TAG_CLASSES: Record<string, string> = {
  gray: "bg-muted text-muted-foreground",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  blue: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
};

export const TAG_DOT: Record<string, string> = {
  gray: "bg-muted-foreground",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function TagChip({ tag }: { tag: TagDTO }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[10rem] items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
        TAG_CLASSES[tag.color] || TAG_CLASSES.gray
      )}
    >
      {tag.name}
    </span>
  );
}

/// One color per person, the same everywhere: picked from their id, so it
/// never changes between visits. Literal classes so Tailwind keeps them.
const AVATAR_COLORS = [
  "from-rose-500 to-orange-400",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-400",
  "from-violet-500 to-fuchsia-500",
  "from-amber-500 to-orange-500",
  "from-cyan-500 to-blue-500",
  "from-pink-500 to-rose-400",
  "from-indigo-500 to-violet-500",
  "from-lime-500 to-emerald-600",
  "from-red-500 to-pink-500",
  "from-teal-500 to-cyan-600",
  "from-fuchsia-500 to-purple-600",
];

export function avatarColor(id?: string): string {
  if (!id) return "from-zinc-400 to-zinc-500";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ member, size = "sm" }: { member?: RosterMember; size?: "sm" | "md" }) {
  return (
    <Tip label={member?.name || "Former member"} side="top">
      <span
        aria-label={member?.name || "Former member"}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-semibold tracking-tight text-white shadow-sm ring-2 ring-background",
          avatarColor(member?.id),
          size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs"
        )}
      >
        {member?.initials || "?"}
      </span>
    </Tip>
  );
}

export function AvatarStack({ ids, members }: { ids: string[]; members: Map<string, RosterMember> }) {
  if (!ids.length) return null;
  const shown = ids.slice(0, 3);
  return (
    <span className="flex -space-x-1.5">
      {shown.map((id) => (
        <Avatar key={id} member={members.get(id)} />
      ))}
      {ids.length > shown.length ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{ids.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}

/// Overdue is red with the date, due today amber.
export function DueChip({ task }: { task: TaskDTO }) {
  if (!task.dueLabel) return null;
  const tone =
    task.dueState === "overdue"
      ? "text-red-700 dark:text-red-400 font-semibold"
      : task.dueState === "today"
        ? "text-amber-700 dark:text-amber-400 font-semibold"
        : "text-muted-foreground";
  const text =
    task.dueState === "overdue"
      ? `Overdue ${task.dueLabel}`
      : task.dueState === "today"
        ? "Due today"
        : task.dueLabel;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
      <Calendar className="size-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

export function StaleChip({ task }: { task: TaskDTO }) {
  if (!task.staleLevel) return null;
  return (
    <Tip label={`No activity for ${task.staleDays} days`}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none",
          task.staleLevel === "red"
            ? "bg-red-500/15 text-red-700 dark:text-red-300"
            : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
        )}
      >
        <Hourglass className="size-3" aria-hidden="true" />
        Stale {task.staleDays}d
      </span>
    </Tip>
  );
}

export function useMemberMap(members: RosterMember[]) {
  return React.useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
}

export function useTagMap(tags: TagDTO[]) {
  return React.useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
}
