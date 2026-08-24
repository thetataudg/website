"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faList, faTableCellsLarge } from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";
import {
  GemCommitteeList,
  GemMemberCard,
  GemSheet,
  GemStatusBadge,
  gemShortVerdict,
  gemVerdictTone,
  STANDING_BADGES,
  STANDING_LABELS,
  formatDateShort,
  formatMemberName,
  gemVerdictLine,
  type GemCriterion,
  type GemMember,
  type GemStatusResponse,
} from "../../../components/GemSheet";
import { GEM_STANDINGS, type GemStandingValue } from "@/lib/gem";

const STANDING_FILTER_OPTIONS = [
  { value: "all", label: "Standing (all)" },
  ...GEM_STANDINGS.map((value) => ({ value, label: STANDING_LABELS[value] })),
];

/// The chapter-wide GEM board.
///
/// Reading is open to every seat on E-Council; writing — Section 2
/// substitutions, probation standing, the recorded GPA — is the Regent, Vice
/// Regent, Scribe and admins, which the API tells us in `canManage` rather
/// than this page guessing at it.
export default function AdminGemDashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<GemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeFilters, setRangeFilters] = useState({ start: "", end: "", semester: "" });
  const [hasSeededFilters, setHasSeededFilters] = useState(false);
  const [memberFilters, setMemberFilters] = useState({
    name: "",
    committee: "all",
    standing: "all",
    meeting: "all",
  });
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  // Remembered across visits. An officer who prefers the table should not have
  // to say so every time they open the board — the iOS app persists the same
  // choice, and the two disagreeing would read as a bug.
  useEffect(() => {
    const stored = window.localStorage.getItem("chapterGemLayout");
    if (stored === "cards" || stored === "list") setViewMode(stored);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("chapterGemLayout", viewMode);
  }, [viewMode]);
  const [detailMember, setDetailMember] = useState<GemMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{
    memberId: string;
    role: string;
    isECouncil: boolean;
  } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(true);

  /// The Section 2 editor, open on one criterion of one member.
  const [overrideTarget, setOverrideTarget] = useState<{
    member: GemMember;
    criterion: GemCriterion;
  } | null>(null);
  const [overrideGranted, setOverrideGranted] = useState(true);
  const [overrideNote, setOverrideNote] = useState("");

  /// The Section 3 editor: probation, cooldown and the goals attached to them.
  const [standingTarget, setStandingTarget] = useState<GemMember | null>(null);
  const [standingValue, setStandingValue] = useState<GemStandingValue>("none");
  const [standingNote, setStandingNote] = useState("");

  const [gpaTarget, setGpaTarget] = useState<GemMember | null>(null);
  const [gpaValue, setGpaValue] = useState("");

  const rangeFiltersRef = useRef(rangeFilters);
  const hasSeededFiltersRef = useRef(hasSeededFilters);

  const loadStatus = useCallback(async (overrides?: Partial<typeof rangeFilters>) => {
    setLoading(true);
    setError(null);
    try {
      const baseFilters = overrides ?? rangeFiltersRef.current;
      const options = {
        start: baseFilters.start ?? "",
        end: baseFilters.end ?? "",
        semester: baseFilters.semester ?? "",
      };
      const params = new URLSearchParams();
      if (options.start) params.set("start", options.start);
      if (options.end) params.set("end", options.end);
      if (options.semester) params.set("semester", options.semester);
      const res = await fetch(
        `/api/gem/status${params.toString() ? `?${params.toString()}` : ""}`
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as any;
        throw new Error(payload?.error || "Failed to load GEM status");
      }
      const payload = (await res.json()) as GemStatusResponse;
      setStatus(payload);
      if (!hasSeededFiltersRef.current) {
        setRangeFilters({
          start: payload.startDate,
          end: payload.endDate,
          semester: payload.semesterName,
        });
        setHasSeededFilters(true);
        hasSeededFiltersRef.current = true;
      } else {
        setRangeFilters(options);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load GEM data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) loadStatus();
  }, [isLoaded, isSignedIn, loadStatus]);

  useEffect(() => {
    rangeFiltersRef.current = rangeFilters;
  }, [rangeFilters]);

  useEffect(() => {
    hasSeededFiltersRef.current = hasSeededFilters;
  }, [hasSeededFilters]);

  useEffect(() => {
    async function loadViewer() {
      setViewerLoading(true);
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setViewer({
          memberId: data.memberId,
          role: data.role,
          isECouncil: data.isECouncil,
        });
      } catch {
        setViewer(null);
      } finally {
        setViewerLoading(false);
      }
    }

    if (isLoaded && isSignedIn) {
      loadViewer();
    } else {
      setViewer(null);
      setViewerLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  // Keep whichever modal is open pointed at the freshly loaded copy of its
  // member, so a save doesn't leave the sheet showing pre-save numbers.
  useEffect(() => {
    if (!status) return;
    const refresh = (member: GemMember | null) =>
      member
        ? status.members.find((row) => row.memberId === member.memberId) || member
        : null;
    setDetailMember((prev) => refresh(prev));
    setStandingTarget((prev) => refresh(prev));
    setGpaTarget((prev) => refresh(prev));
    setOverrideTarget((prev) => {
      if (!prev) return null;
      const member = refresh(prev.member);
      if (!member) return prev;
      const criterion =
        [...member.requirements, ...member.points].find(
          (row) => row.key === prev.criterion.key
        ) || prev.criterion;
      return { member, criterion };
    });
  }, [status]);

  const canManage = Boolean(status?.canManage);
  const canRead =
    viewer?.role === "admin" ||
    viewer?.role === "superadmin" ||
    Boolean(viewer?.isECouncil);

  const patchRecord = async (memberId: string, body: Record<string, any>) => {
    if (!status) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/gem/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, semester: status.semesterName, ...body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error || "Failed to save");
      }
      await loadStatus();
      return true;
    } catch (err: any) {
      setError(err?.message || "Unable to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openOverride = (member: GemMember) => (criterion: GemCriterion) => {
    setOverrideTarget({ member, criterion });
    setOverrideGranted(criterion.overridden ? criterion.satisfied : true);
    setOverrideNote(criterion.overrideNote || "");
  };

  const saveOverride = async (clear = false) => {
    if (!overrideTarget) return;
    const ok = await patchRecord(overrideTarget.member.memberId, {
      override: {
        key: overrideTarget.criterion.key,
        granted: clear ? null : overrideGranted,
        note: overrideNote,
      },
    });
    if (ok) setOverrideTarget(null);
  };

  const saveStanding = async () => {
    if (!standingTarget) return;
    const ok = await patchRecord(standingTarget.memberId, {
      standing: standingValue,
      standingNote,
    });
    if (ok) setStandingTarget(null);
  };

  const saveGpa = async () => {
    if (!gpaTarget) return;
    const ok = await patchRecord(gpaTarget.memberId, {
      gpa: gpaValue.trim() === "" ? null : Number(gpaValue),
    });
    if (ok) setGpaTarget(null);
  };

  // --- Filtering ----------------------------------------------------------

  const visibleMembers = useMemo(
    () => (status?.members || []).filter((member) => member.role !== "superadmin"),
    [status]
  );

  const committeeOptions = useMemo(() => {
    const options = new Set<string>();
    visibleMembers.forEach((member) =>
      member.committees.forEach((name) => options.add(name))
    );
    return Array.from(options).sort();
  }, [visibleMembers]);

  const filteredMembers = useMemo(() => {
    const needle = memberFilters.name.trim().toLowerCase();
    return visibleMembers.filter((member) => {
      if (needle) {
        const haystack = `${formatMemberName(member)} ${member.rollNo || ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (
        memberFilters.committee !== "all" &&
        !member.committees.includes(memberFilters.committee)
      ) {
        return false;
      }
      if (
        memberFilters.standing !== "all" &&
        member.standing !== memberFilters.standing
      ) {
        return false;
      }
      if (memberFilters.meeting === "meeting" && !member.hasCompletedGem) return false;
      if (memberFilters.meeting === "not" && member.hasCompletedGem) return false;
      if (memberFilters.meeting === "requirements" && member.requirementsMet) return false;
      return true;
    });
  }, [visibleMembers, memberFilters]);

  /// Chapter-level counts. "Requirement short" is broken out from the rest
  /// because it is the failure a member cannot fix with more points, and it is
  /// the one the Regent needs a list of before the last meeting of the term.
  const gemStats = useMemo(() => {
    const total = visibleMembers.length;
    const met = visibleMembers.filter((m) => m.hasCompletedGem).length;
    const requirementShort = visibleMembers.filter((m) => !m.requirementsMet).length;
    const onePoint = visibleMembers.filter(
      (m) => !m.hasCompletedGem && m.requirementsMet && m.pointsRequired - m.pointsEarned === 1
    ).length;
    const morePoints = visibleMembers.filter(
      (m) => !m.hasCompletedGem && m.requirementsMet && m.pointsRequired - m.pointsEarned > 1
    ).length;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    return {
      total,
      met,
      requirementShort,
      onePoint,
      morePoints,
      metPct: pct(met),
      requirementShortPct: pct(requirementShort),
      onePointPct: pct(onePoint),
      morePointsPct: pct(morePoints),
    };
  }, [visibleMembers]);

  if (!isLoaded) return <LoadingState message="Validating session..." />;
  if (!isSignedIn) {
    return (
      <div className="container">
        <div className="alert alert-danger mt-5 d-flex align-items-center">
          <div>
            <h4>Please sign in to view GEM data.</h4>
          </div>
          <div className="ms-auto">
            <RedirectToSignIn />
          </div>
        </div>
      </div>
    );
  }
  if (viewerLoading) return <LoadingState message="Loading GEM data..." />;
  if (!canRead) {
    return (
      <div className="container">
        <div className="alert alert-danger mt-5">
          <h4>Access Denied</h4>
          <p>Only administrators and E-Council members can access the chapter GEM board.</p>
        </div>
      </div>
    );
  }

  const statBlocks = [
    { label: "Meeting GEM", value: gemStats.met, pct: gemStats.metPct, tone: "success" },
    {
      label: "Requirement short",
      value: gemStats.requirementShort,
      pct: gemStats.requirementShortPct,
      tone: "danger",
    },
    { label: "1 point away", value: gemStats.onePoint, pct: gemStats.onePointPct, tone: "primary" },
    { label: "2+ points away", value: gemStats.morePoints, pct: gemStats.morePointsPct, tone: "warning" },
  ];

  return (
    <div className="member-dashboard gem-dashboard">
      <section className="bento-card gem-hero">
        <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
          <div>
            <p className="hero-eyebrow text-muted">GEM</p>
            <h1 className="hero-title mb-1">Manage GEM</h1>
            {status && (
              <>
                <p className="text-muted small mb-1">
                  Semester: {status.semesterName} ({formatDateShort(status.startDate)} →{" "}
                  {formatDateShort(status.endDate)})
                </p>
                <p className="text-muted small mb-1">
                  {status.totals.generalTotal} general meetings held ·{" "}
                  {status.totals.generalRequired} required ·{" "}
                  {status.totals.pnmMeetingTotal} PNM meetings held
                </p>
              </>
            )}
            <p className="text-muted small mb-0">
              Showing {filteredMembers.length} / {visibleMembers.length} members
              {!canManage && " · read-only"}
            </p>
          </div>
          <div
            className="btn-group btn-group-sm align-self-start flex-shrink-0"
            role="group"
            aria-label="Board layout"
          >
            <button
              type="button"
              className={`btn ${viewMode === "cards" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
              title="Card view"
            >
              <FontAwesomeIcon icon={faTableCellsLarge} />
              <span className="visually-hidden">Card view</span>
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "list" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
            >
              <FontAwesomeIcon icon={faList} />
              <span className="visually-hidden">List view</span>
            </button>
          </div>
        </div>

        <div className="border-top mt-3 pt-3">
          <div className="row g-3">
            <div className="col-sm-6 col-md-4 col-xl-3">
              <label className="form-label small text-muted">Name or roll</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search"
                value={memberFilters.name}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">Committee</label>
              <select
                className="form-select form-select-sm"
                value={memberFilters.committee}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, committee: e.target.value }))
                }
              >
                <option value="all">All committees</option>
                {committeeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">Standing</label>
              <select
                className="form-select form-select-sm"
                value={memberFilters.standing}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, standing: e.target.value }))
                }
              >
                {STANDING_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">GEM status</label>
              <select
                className="form-select form-select-sm"
                value={memberFilters.meeting}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, meeting: e.target.value }))
                }
              >
                <option value="all">All</option>
                <option value="meeting">Meeting GEM</option>
                <option value="not">Not meeting GEM</option>
                <option value="requirements">Requirement not met</option>
              </select>
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">Start date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={rangeFilters.start}
                onChange={(e) =>
                  setRangeFilters((prev) => ({ ...prev, start: e.target.value }))
                }
              />
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">End date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={rangeFilters.end}
                onChange={(e) =>
                  setRangeFilters((prev) => ({ ...prev, end: e.target.value }))
                }
              />
            </div>
            <div className="col-sm-6 col-md-4 col-xl-2">
              <label className="form-label small text-muted">Semester</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g., Fall 2026"
                value={rangeFilters.semester}
                onChange={(e) =>
                  setRangeFilters((prev) => ({ ...prev, semester: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="d-flex justify-content-end mt-2">
            <button
              type="button"
              className="btn btn-primary px-4"
              onClick={() => loadStatus(rangeFilters)}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-warning mt-3 mb-0" role="alert">
            {error}
          </div>
        )}
        {loading && <LoadingState message="Loading GEM standings..." />}
      </section>

      {!loading && status && (
        <section className="bento-card mt-3">
          <h2 className="h5 mb-3">Chapter overview</h2>
          <div className="row g-3">
            {statBlocks.map((block) => (
              <div className="col-12 col-md-6 col-xl-3" key={block.label}>
                <div className={`card border-${block.tone} h-100`}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h3 className={`h6 mb-0 text-${block.tone}`}>{block.label}</h3>
                      <span className={`badge bg-${block.tone}`}>{block.value}</span>
                    </div>
                    <div className="progress mb-2" style={{ height: "20px" }}>
                      <div
                        className={`progress-bar bg-${block.tone}`}
                        role="progressbar"
                        style={{ width: `${block.pct}%` }}
                        aria-valuenow={block.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        {block.pct > 10 && `${block.pct.toFixed(0)}%`}
                      </div>
                    </div>
                    <p className="text-muted small mb-0">
                      {block.value} of {gemStats.total} active members (
                      {block.pct.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bento-card mt-3">
        {viewMode === "cards" ? (
          filteredMembers.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">
              No members match the current filters.
            </p>
          ) : (
            <div className="row g-3">
              {filteredMembers.map((member) => (
                <div key={member.memberId} className="col-6 col-md-4 col-xl-3">
                  <GemMemberCard member={member} onOpen={setDetailMember} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Requirements</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No members match the current filters.
                    </td>
                  </tr>
                )}
                {filteredMembers.map((member) => (
                  <tr key={member.memberId}>
                    <td>
                      <strong>{formatMemberName(member)}</strong>
                      <div className="text-muted small">#{member.rollNo || "N/A"}</div>
                      {member.committees.length > 0 && (
                        <div className="text-muted small">
                          {member.committees.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${member.requirementsMet ? "bg-success" : "bg-danger"}`}
                      >
                        {member.requirementsMet ? "Met" : "Not met"}
                      </span>
                      {!member.requirementsMet && (
                        <div className={`small mt-1 ${gemVerdictTone(member)}`}>
                          {gemShortVerdict(member)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>
                        {member.pointsEarned}/{member.pointsRequired}
                      </div>
                      <div className="text-muted small">
                        of {member.pointsAvailable} available
                      </div>
                    </td>
                    <td>
                      <GemStatusBadge member={member} />
                      {member.standing !== "none" && (
                        <div className="mt-1">
                          <span className={`badge ${STANDING_BADGES[member.standing]}`}>
                            {STANDING_LABELS[member.standing]}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setDetailMember(member)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailMember && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title">
                      GEM sheet — {formatMemberName(detailMember)}
                    </h5>
                    <p className="text-muted small mb-0">
                      #{detailMember.rollNo || "N/A"}
                      {detailMember.ecouncilPosition
                        ? ` · ${detailMember.ecouncilPosition}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setDetailMember(null)}
                  />
                </div>
                <div className="modal-body">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <GemStatusBadge member={detailMember} className="fs-6 px-3 py-2" />
                    <span className={`badge ${STANDING_BADGES[detailMember.standing]}`}>
                      {STANDING_LABELS[detailMember.standing]}
                    </span>
                    <span className="text-muted small">{gemVerdictLine(detailMember)}</span>
                  </div>
                  {detailMember.standingNote && (
                    <div className="alert alert-warning py-2">
                      <strong>Goals:</strong> {detailMember.standingNote}
                    </div>
                  )}

                  <GemSheet
                    member={detailMember}
                    onManage={canManage ? openOverride(detailMember) : undefined}
                  />

                  <div className="mt-3">
                    <h6 className="mb-2">Committee meetings</h6>
                    <GemCommitteeList member={detailMember} />
                  </div>

                  <div className="mt-3 text-muted small">
                    Recorded GPA:{" "}
                    {detailMember.gpa.value !== null
                      ? detailMember.gpa.value.toFixed(2)
                      : "not recorded"}{" "}
                    · not scored under the current bylaws.
                    {detailMember.gemRecordUpdatedAt && (
                      <>
                        {" "}
                        Last saved{" "}
                        {new Date(detailMember.gemRecordUpdatedAt).toLocaleDateString()}.
                      </>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  {canManage && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline-warning"
                        onClick={() => {
                          setStandingValue(detailMember.standing);
                          setStandingNote(detailMember.standingNote || "");
                          setStandingTarget(detailMember);
                        }}
                      >
                        Standing
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={() => {
                          setGpaValue(
                            detailMember.gpa.value !== null
                              ? String(detailMember.gpa.value)
                              : ""
                          );
                          setGpaTarget(detailMember);
                        }}
                      >
                        GPA
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDetailMember(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      {overrideTarget && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title">Section 2 substitution</h5>
                    <p className="text-muted small mb-0">
                      {overrideTarget.criterion.label} ·{" "}
                      {formatMemberName(overrideTarget.member)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setOverrideTarget(null)}
                  />
                </div>
                <div className="modal-body">
                  <p className="text-muted small">
                    A member may replace a requirement with a service to the chapter,
                    documented in writing and presented verbally at a general meeting,
                    approved by a majority vote. Record the outcome of that vote here.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Outcome</label>
                    <select
                      className="form-select"
                      value={overrideGranted ? "granted" : "denied"}
                      onChange={(e) => setOverrideGranted(e.target.value === "granted")}
                    >
                      <option value="granted">Chapter approved the substitution</option>
                      <option value="denied">Chapter denied it (mark unmet)</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Written documentation</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      placeholder="What service was performed, and when the chapter voted."
                      value={overrideNote}
                      onChange={(e) => setOverrideNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  {overrideTarget.criterion.overridden && (
                    <button
                      type="button"
                      className="btn btn-outline-danger me-auto"
                      onClick={() => saveOverride(true)}
                      disabled={saving}
                    >
                      Remove substitution
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => saveOverride(false)}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setOverrideTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      {standingTarget && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Standing — {formatMemberName(standingTarget)}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setStandingTarget(null)}
                  />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Section 3 standing</label>
                    <select
                      className="form-select"
                      value={standingValue}
                      onChange={(e) =>
                        setStandingValue(e.target.value as GemStandingValue)
                      }
                    >
                      {GEM_STANDINGS.map((value) => (
                        <option key={value} value={value}>
                          {STANDING_LABELS[value]}
                        </option>
                      ))}
                    </select>
                    <div className="form-text">
                      Cooldown is the semester after a probation. A member on cooldown who
                      fails GEM again skips the first round of voting.
                    </div>
                  </div>
                  <div>
                    <label className="form-label">
                      Membership Integrity goals (up to 3)
                    </label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={standingNote}
                      onChange={(e) => setStandingNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveStanding}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStandingTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      {gpaTarget && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">GPA for {formatMemberName(gpaTarget)}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setGpaTarget(null)}
                  />
                </div>
                <div className="modal-body">
                  <p className="text-muted small">
                    Recorded for the chapter&apos;s own reference. The 3.0 GPA point was
                    removed from GEM, so this does not affect the sheet above.
                  </p>
                  <label className="form-label">GPA</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.01}
                    className="form-control"
                    value={gpaValue}
                    onChange={(e) => setGpaValue(e.target.value)}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveGpa}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setGpaTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
    </div>
  );
}
