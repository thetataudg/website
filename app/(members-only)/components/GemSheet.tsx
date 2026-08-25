"use client";

import { Check, Gavel, X } from "lucide-react";
import type { GemCriterionKey, GemStandingValue } from "@/lib/gem";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/// One requirement or point row, as `/api/gem/status` returns it.
///
/// The wording is built server-side by `evaluateGem` rather than here, so the
/// website and the iOS app say the same thing about the same member instead of
/// each phrasing the bylaw their own way.
export interface GemCriterion {
  key: GemCriterionKey;
  label: string;
  rule: string;
  detail: string;
  hint?: string;
  satisfied: boolean;
  overridden: boolean;
  overrideNote?: string;
}

export interface GemCommitteeDetail {
  id: string;
  name: string;
  totalMeetings: number;
  attended: number;
  required: number;
  satisfied: boolean;
}

export interface GemMember {
  memberId: string;
  rollNo?: string;
  fName?: string;
  lName?: string;
  status?: string;
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string | null;
  committees: string[];
  committeeIds: string[];
  committeeDetails: GemCommitteeDetail[];
  requirements: GemCriterion[];
  points: GemCriterion[];
  requirementsMet: boolean;
  pointsEarned: number;
  pointsRequired: number;
  pointsAvailable: number;
  hasCompletedGem: boolean;
  standing: GemStandingValue;
  standingNote: string;
  gpa: { value: number | null; recordId: string | null };
  gemRecordUpdatedAt?: string | null;
}

export interface GemChapterTotals {
  generalTotal: number;
  generalRequired: number;
  pnmMeetingTotal: number;
  pnmRequirementRequired: number;
  pnmPointRequired: number;
}

export interface GemStatusResponse {
  semesterName: string;
  startDate: string;
  endDate: string;
  pointsRequired: number;
  pointsAvailable: number;
  totals: GemChapterTotals;
  canManage: boolean;
  members: GemMember[];
}

export const STANDING_LABELS: Record<GemStandingValue, string> = {
  none: "Good standing",
  probation: "GEM probation",
  cooldown: "Cooldown",
};

/// Badge variants, not Bootstrap classes: consumers pass these straight to
/// `<Badge variant={...}>`.
export const STANDING_BADGES: Record<
  GemStandingValue,
  "muted" | "warning" | "secondary"
> = {
  none: "muted",
  probation: "warning",
  cooldown: "secondary",
};

export function capitalizeNamePart(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function formatMemberName(member: GemMember) {
  const full = [capitalizeNamePart(member.fName), capitalizeNamePart(member.lName)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || "Unknown";
}

export function formatDateShort(value?: string) {
  if (!value) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US");
}

/// Why a member did or didn't make GEM, in one line.
///
/// The two halves are not interchangeable — seven points with a requirement
/// missed is still a fail — so the summary always names the requirement
/// failure first when there is one.
export function gemVerdictLine(member: GemMember) {
  if (member.hasCompletedGem) return "All requirements met · GEM earned";
  if (!member.requirementsMet) {
    const missing = member.requirements
      .filter((row) => !row.satisfied)
      .map((row) => row.label)
      .join(", ");
    return `Requirement not met: ${missing}`;
  }
  const short = member.pointsRequired - member.pointsEarned;
  return `${short} more point${short === 1 ? "" : "s"} needed`;
}

/// The same answer, short enough for a card or a table cell.
///
/// Naming both missed requirements wrapped to three lines in a grid tile.
/// One missing requirement is worth naming; two is a count.
export function gemShortVerdict(member: GemMember) {
  if (member.hasCompletedGem) return "GEM earned";
  const missing = member.requirements.filter((row) => !row.satisfied);
  if (missing.length === 1) return `Missing ${missing[0].label.toLowerCase()}`;
  if (missing.length > 1) return `${missing.length} requirements missing`;
  const short = member.pointsRequired - member.pointsEarned;
  return `${short} more point${short === 1 ? "" : "s"}`;
}

/// The tone the verdict is written in. Gold-ish for earned, red for a
/// requirement that points cannot fix, muted for merely short.
export function gemVerdictTone(member: GemMember) {
  if (member.hasCompletedGem) return "text-emerald-700 dark:text-emerald-400";
  return member.requirementsMet ? "text-muted-foreground" : "text-destructive";
}

export function GemStatusBadge({
  member,
  className = "",
}: {
  member: GemMember;
  className?: string;
}) {
  return (
    <Badge
      variant={member.hasCompletedGem ? "success" : "destructive"}
      className={className}
    >
      {member.hasCompletedGem ? (
        <Check aria-hidden="true" />
      ) : (
        <X aria-hidden="true" />
      )}
      {member.hasCompletedGem ? "GEM satisfied" : "GEM not satisfied"}
    </Badge>
  );
}

/// A single criterion. `onManage` turns the row into a control for recording a
/// Section 2 substitution; without it the row is read-only.
///
/// Two lines, not four. An earlier pass printed the bylaw text in italics under
/// every row, which meant twelve sentences to read past to find the two numbers
/// that actually move. The rule now lives where it is needed — in the
/// substitution editor, where an officer is about to override it — and on hover
/// here, via the row's title.
export function GemCriterionRow({
  criterion,
  onManage,
}: {
  criterion: GemCriterion;
  onManage?: (criterion: GemCriterion) => void;
}) {
  const detail = criterion.hint
    ? `${criterion.detail} · ${criterion.hint}`
    : criterion.detail;
  return (
    <li
      className="flex items-center justify-between gap-3 px-3 py-2"
      title={criterion.rule}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {criterion.satisfied ? (
          <Check
            aria-hidden="true"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <X aria-hidden="true" className="size-4 shrink-0 text-destructive" />
        )}
        <span className="sr-only">
          {criterion.satisfied ? "Satisfied: " : "Not satisfied: "}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-sm font-semibold text-foreground">
              {criterion.label}
            </strong>
            {criterion.overridden && (
              <Gavel
                className="size-3.5 shrink-0 text-primary"
                aria-label={
                  criterion.overrideNote || "Granted by chapter vote"
                }
              />
            )}
          </div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
      {onManage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onManage(criterion)}
        >
          {criterion.overridden ? "Edit" : "Substitute"}
          <span className="sr-only">{` ${criterion.label}`}</span>
        </Button>
      )}
    </li>
  );
}

/// The whole sheet: both requirements, then the ten points.
export function GemSheet({
  member,
  onManage,
}: {
  member: GemMember;
  onManage?: (criterion: GemCriterion) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Requirements
          </CardTitle>
          <Badge variant={member.requirementsMet ? "success" : "destructive"}>
            {member.requirementsMet ? "Met" : "Not met"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {member.requirements.length ? (
            <ul className="divide-y divide-border">
              {member.requirements.map((criterion) => (
                <GemCriterionRow
                  key={criterion.key}
                  criterion={criterion}
                  onManage={onManage}
                />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No requirements tracked this semester.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Points
          </CardTitle>
          <Badge
            variant={
              member.pointsEarned >= member.pointsRequired
                ? "success"
                : "muted"
            }
          >
            {member.pointsEarned}/{member.pointsRequired}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {member.points.length ? (
            <ul className="divide-y divide-border">
              {member.points.map((criterion) => (
                <GemCriterionRow
                  key={criterion.key}
                  criterion={criterion}
                  onManage={onManage}
                />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No points tracked this semester.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/// One member as a grid tile.
export function GemMemberCard({
  member,
  onOpen,
}: {
  member: GemMember;
  onOpen: (member: GemMember) => void;
}) {
  const pct = Math.round(
    (Math.min(member.pointsEarned, member.pointsRequired) /
      Math.max(1, member.pointsRequired)) *
      100
  );
  return (
    <Card
      className={cn(
        "h-full cursor-pointer transition-colors hover:border-primary/50",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        member.hasCompletedGem
          ? "border-emerald-600/40"
          : "border-destructive/40"
      )}
    >
      <CardContent className="p-4">
        {/* A real button, not a role="button" div: keyboard activation,
          * focus, and the accessible name all come for free. */}
        <button
          type="button"
          onClick={() => onOpen(member)}
          className="w-full text-left outline-none"
        >
          <span className="sr-only">
            {`Open GEM sheet for ${formatMemberName(member)}`}
          </span>
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <strong className="block truncate text-foreground">
                {formatMemberName(member)}
              </strong>
              <span className="text-xs text-muted-foreground">
                #{member.rollNo || "N/A"}
              </span>
            </span>
            {member.standing !== "none" && (
              <Badge
                variant={STANDING_BADGES[member.standing]}
                className="shrink-0"
              >
                {STANDING_LABELS[member.standing]}
              </Badge>
            )}
          </span>

          <span className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {member.pointsEarned}/{member.pointsRequired}
            </span>
            <span className="text-xs text-muted-foreground">points</span>
          </span>

          <span
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Points earned"
            className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                member.hasCompletedGem
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : "bg-muted-foreground"
              )}
              style={{ width: `${Math.max(pct, 3)}%` }}
            />
          </span>

          <span className={cn("mt-2 block text-xs", gemVerdictTone(member))}>
            {gemShortVerdict(member)}
          </span>
        </button>
      </CardContent>
    </Card>
  );
}

/// The committee breakdown behind the committee point.
export function GemCommitteeList({ member }: { member: GemMember }) {
  if (!member.committeeDetails.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No committee assignments this semester.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {member.committeeDetails.map((committee) => (
        <li
          key={committee.id}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {committee.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {committee.totalMeetings <= 2
                ? `Auto-met · ${committee.totalMeetings} meetings held`
                : `${committee.attended}/${committee.required} attended · ${committee.totalMeetings} meetings held`}
            </p>
          </div>
          {committee.satisfied ? (
            <Check
              aria-label="Satisfied"
              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
          ) : (
            <X
              aria-label="Not satisfied"
              className="size-4 shrink-0 text-destructive"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
