"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faGavel, faTimes } from "@fortawesome/free-solid-svg-icons";
import type { GemCriterionKey, GemStandingValue } from "@/lib/gem";

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

export const STANDING_BADGES: Record<GemStandingValue, string> = {
  none: "bg-secondary",
  probation: "bg-warning text-dark",
  cooldown: "bg-info text-dark",
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
  if (member.hasCompletedGem) return "text-success";
  return member.requirementsMet ? "text-muted" : "text-danger";
}

export function GemStatusBadge({
  member,
  className = "",
}: {
  member: GemMember;
  className?: string;
}) {
  return (
    <span
      className={`badge ${member.hasCompletedGem ? "bg-success" : "bg-danger"} ${className}`}
    >
      <FontAwesomeIcon
        icon={member.hasCompletedGem ? faCheck : faTimes}
        className="me-2"
      />
      {member.hasCompletedGem ? "GEM Satisfied" : "GEM Not Satisfied"}
    </span>
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
    <li className="list-group-item px-3 py-2" title={criterion.rule}>
      <div className="d-flex justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 0 }}>
          <FontAwesomeIcon
            icon={criterion.satisfied ? faCheck : faTimes}
            className={criterion.satisfied ? "text-success" : "text-danger"}
            fixedWidth
          />
          <div style={{ minWidth: 0 }}>
            <div className="d-flex align-items-center gap-2">
              <strong className="small">{criterion.label}</strong>
              {criterion.overridden && (
                <FontAwesomeIcon
                  icon={faGavel}
                  className="text-primary"
                  title={criterion.overrideNote || "Granted by chapter vote"}
                />
              )}
            </div>
            <div className="text-muted small">{detail}</div>
          </div>
        </div>
        {onManage && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary flex-shrink-0"
            onClick={() => onManage(criterion)}
          >
            {criterion.overridden ? "Edit" : "Substitute"}
          </button>
        )}
      </div>
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
    <div className="row g-3">
      <div className="col-12 col-lg-5">
        <div
          className={`card h-100 border ${
            member.requirementsMet ? "border-success" : "border-danger"
          }`}
        >
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <strong className="small text-uppercase">Requirements</strong>
            <span
              className={`badge ${member.requirementsMet ? "bg-success" : "bg-danger"}`}
            >
              {member.requirementsMet ? "Met" : "Not met"}
            </span>
          </div>
          <ul className="list-group list-group-flush">
            {member.requirements.map((criterion) => (
              <GemCriterionRow
                key={criterion.key}
                criterion={criterion}
                onManage={onManage}
              />
            ))}
          </ul>
        </div>
      </div>
      <div className="col-12 col-lg-7">
        <div className="card h-100 border">
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <strong className="small text-uppercase">Points</strong>
            <span
              className={`badge ${
                member.pointsEarned >= member.pointsRequired ? "bg-success" : "bg-secondary"
              }`}
            >
              {member.pointsEarned}/{member.pointsRequired}
            </span>
          </div>
          <ul className="list-group list-group-flush">
            {member.points.map((criterion) => (
              <GemCriterionRow
                key={criterion.key}
                criterion={criterion}
                onManage={onManage}
              />
            ))}
          </ul>
        </div>
      </div>
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
    <article
      className={`gem-card h-100 ${member.hasCompletedGem ? "gem-card--met" : "gem-card--missed"}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(member)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(member);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div style={{ minWidth: 0 }}>
            <strong className="d-block text-truncate">{formatMemberName(member)}</strong>
            <span className="text-muted small">#{member.rollNo || "N/A"}</span>
          </div>
          {member.standing !== "none" && (
            <span className={`badge ${STANDING_BADGES[member.standing]} flex-shrink-0`}>
              {STANDING_LABELS[member.standing]}
            </span>
          )}
        </div>

        <div className="d-flex align-items-baseline gap-2 mt-3">
          <span className="h4 mb-0">
            {member.pointsEarned}/{member.pointsRequired}
          </span>
          <span className="text-muted small">points</span>
        </div>
        <div className="progress mt-1" style={{ height: "6px" }}>
          <div
            className={`progress-bar ${member.hasCompletedGem ? "bg-success" : "bg-secondary"}`}
            role="progressbar"
            style={{ width: `${Math.max(pct, 3)}%` }}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className={`small mt-2 ${gemVerdictTone(member)}`}>
          {gemShortVerdict(member)}
        </div>
      </div>
    </article>
  );
}

/// The committee breakdown behind the committee point.
export function GemCommitteeList({ member }: { member: GemMember }) {
  if (!member.committeeDetails.length) {
    return <p className="text-muted mb-0">No committee assignments this semester.</p>;
  }
  return (
    <div className="list-group">
      {member.committeeDetails.map((committee) => (
        <div
          key={committee.id}
          className={`list-group-item d-flex justify-content-between align-items-center ${
            committee.satisfied ? "list-group-item-success" : "list-group-item-danger"
          }`}
        >
          <div className="me-3">
            <div className="fw-semibold">{committee.name}</div>
            <small className="text-muted">
              {committee.totalMeetings <= 2
                ? `Auto-met · ${committee.totalMeetings} meetings held`
                : `${committee.attended}/${committee.required} attended · ${committee.totalMeetings} meetings held`}
            </small>
          </div>
          <FontAwesomeIcon
            icon={committee.satisfied ? faCheck : faTimes}
            className={committee.satisfied ? "text-success" : "text-danger"}
          />
        </div>
      ))}
    </div>
  );
}
