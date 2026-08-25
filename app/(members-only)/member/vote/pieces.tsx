"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleDot,
  Hand,
  Lock,
  Minus,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Vote as VoteIcon,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  ABSTAIN,
  STAGE_LABEL,
  choiceTone,
  type ChoiceTone,
  type VoteKind,
  type VoteStage,
} from "./types";

/** The icon a kind of vote is known by, matching the iOS app's symbols. */
export const KIND_ICON: Record<VoteKind, React.ElementType> = {
  Election: VoteIcon,
  Pledge: CheckCircle2,
  Bidding: ThumbsUp,
};

/**
 * Where a vote stands.
 *
 * A badge rather than a bare word, because on this page the stage sits in a
 * list beside titles of every length and needs an edge to be findable.
 */
export function StageBadge({
  stage,
  className,
}: {
  stage: VoteStage;
  className?: string;
}) {
  const variant =
    stage === "open" ? "success" : stage === "locked" ? "warning" : "muted";
  const Icon = stage === "open" ? CircleDot : stage === "locked" ? Lock : CheckCircle2;

  return (
    <Badge variant={variant} className={cn("gap-1", className)}>
      <Icon className="size-3" aria-hidden="true" />
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

/** A short qualifier on a row: "Voted", "Proxy approved", "Snap bid". */
export function VoteFlag({
  children,
  icon: Icon,
  tone = "muted",
}: {
  children: React.ReactNode;
  icon?: React.ElementType;
  tone?: ChoiceTone;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", TONE_TEXT[tone])}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const TONE_TEXT: Record<ChoiceTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  caution: "text-amber-700 dark:text-amber-400",
  negative: "text-destructive",
  muted: "text-muted-foreground",
};

/** The filled look a chosen answer takes. Colour is never the only signal. */
const TONE_SELECTED: Record<ChoiceTone, string> = {
  positive:
    "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-700 hover:text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-500",
  caution:
    "border-amber-500 bg-amber-500 text-black hover:bg-amber-500 hover:text-black dark:border-amber-400 dark:bg-amber-400",
  negative:
    "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
  muted:
    "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background",
};

/** The bar tint used for the same answer in the results. */
export const TONE_BAR: Record<ChoiceTone, string> = {
  positive: "bg-emerald-700 dark:bg-emerald-400",
  caution: "bg-amber-500 dark:bg-amber-400",
  negative: "bg-destructive",
  muted: "bg-muted-foreground",
};

const CHOICE_ICON: Record<string, React.ElementType> = {
  Continue: CheckCircle2,
  Board: TriangleAlert,
  Blackball: X,
  Bid: ThumbsUp,
  "No Bid": ThumbsDown,
  [ABSTAIN]: Minus,
};

/**
 * One answer on a ballot.
 *
 * A button rather than a radio group or a segmented control: the answers are
 * alternatives, not points on a scale, and the selected one is *filled* rather
 * than merely tinted so the choice survives greyscale and forced colours.
 *
 * Pressing the selected answer clears it. Nothing else on the page can undo a
 * choice, and a ballot that cannot be un-answered is one people submit by
 * accident.
 */
export function ChoiceButton({
  choice,
  selected,
  disabled,
  onSelect,
  className,
}: {
  choice: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (next: string | null) => void;
  className?: string;
}) {
  const tone = choiceTone(choice);
  const Icon = CHOICE_ICON[choice] ?? Hand;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : choice)}
      className={cn(
        "h-11 flex-1 gap-2 whitespace-nowrap",
        selected ? TONE_SELECTED[tone] : "text-foreground",
        className
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{choice}</span>
    </Button>
  );
}

/**
 * One line of a result: a name, a count, and a bar as long as its share.
 *
 * The number is always present. A bar alone asks the reader to estimate, and
 * the difference between 17 and 19 votes is frequently the whole outcome.
 */
export function TallyBar({
  label,
  count,
  total,
  tone = "muted",
  caption,
  emphasis,
}: {
  label: string;
  count: number;
  total: number;
  tone?: ChoiceTone;
  caption?: string | null;
  emphasis?: boolean;
}) {
  const fraction = total > 0 ? Math.min(1, count / total) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "min-w-0 text-sm",
            emphasis ? "font-semibold text-foreground" : "font-medium text-foreground"
          )}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {count}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${label}: ${count} of ${total} ballots`}
      >
        <div
          className={cn("h-full rounded-full transition-all", TONE_BAR[tone])}
          style={{ width: fraction > 0 ? `max(0.375rem, ${fraction * 100}%)` : 0 }}
        />
      </div>
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}

/** A labelled number in a header: "Open for 4:12", "Ballots 23". */
export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-base font-semibold tabular-nums",
          tone === "alert" ? "text-destructive" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** A name and the state it is in: "Meeting location — Not set". */
export function StatRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          tone === "positive" && "text-emerald-700 dark:text-emerald-400",
          tone === "negative" && "text-destructive",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A short, quiet explanation attached to a control.
 *
 * Not an `Alert`: nothing here needs acknowledging, and the page already uses
 * `Alert` for the things that do.
 */
export function VoteNote({
  children,
  icon: Icon,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  icon?: React.ElementType;
  tone?: ChoiceTone;
  className?: string;
}) {
  const surface: Record<ChoiceTone, string> = {
    positive: "bg-emerald-700/10 dark:bg-emerald-400/10",
    caution: "bg-amber-500/10 dark:bg-amber-400/10",
    negative: "bg-destructive/10",
    muted: "bg-muted",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm",
        surface[tone],
        className
      )}
    >
      {Icon ? (
        <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden="true" />
      ) : null}
      <div className="min-w-0 flex-1 text-foreground/90">{children}</div>
    </div>
  );
}
