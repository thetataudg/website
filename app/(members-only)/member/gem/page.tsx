"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import LoadingState, { LoadingSpinner } from "../../components/LoadingState";

type GemRequirementKey =
  | "generalConference"
  | "committeeMeetings"
  | "brotherhood"
  | "service"
  | "professionalism"
  | "rush"
  | "fso"
  | "lockIn"
  | "gpa";

const REQUIREMENT_KEYS: GemRequirementKey[] = [
  "generalConference",
  "committeeMeetings",
  "brotherhood",
  "service",
  "professionalism",
  "rush",
  "fso",
  "lockIn",
  "gpa",
];

const REQUIREMENT_LABELS: Record<GemRequirementKey, string> = {
  generalConference: "General Conferences",
  committeeMeetings: "Committee Meetings",
  brotherhood: "Brotherhood",
  service: "Service",
  professionalism: "Professionalism",
  rush: "Rush Events",
  fso: "Fulton Student Org",
  lockIn: "Lock-In",
  gpa: "3.0 GPA",
};

const GPA_FILTER_OPTIONS = [
  { value: "all", label: "GPA (all)" },
  { value: "added", label: "GPA added" },
  { value: "missing", label: "GPA missing" },
];

type RequirementCard = {
  key: GemRequirementKey;
  label: string;
  satisfied: boolean;
  detail: string;
  hint?: string;
};

interface GemCommitteeDetail {
  id: string;
  name: string;
  totalMeetings: number;
  attended: number;
  required: number;
  satisfied: boolean;
}

interface GemMember {
  memberId: string;
  rollNo?: string;
  fName?: string;
  lName?: string;
  status?: string;
  committees: string[];
  committeeIds: string[];
  gem: {
    general: {
      attended: number;
      total: number;
      required: number;
      satisfied: boolean;
    };
    committee: {
      satisfied: boolean;
      details: GemCommitteeDetail[];
    };
    brotherhood: {
      attended: number;
      satisfied: boolean;
    };
    service: {
      attended: number;
      satisfied: boolean;
    };
    professionalism: {
      attended: number;
      satisfied: boolean;
    };
    rush: {
      eventCount: number;
      tablingCount: number;
      total: number;
      required: number;
      satisfied: boolean;
    };
    fso: {
      attended: number;
      satisfied: boolean;
    };
    lockIn: {
      attended: number;
      satisfied: boolean;
    };
    gpa: {
      value: number | null;
      threshold: number;
      satisfied: boolean;
      recordId: string | null;
    };
  };
  satisfiedRequirements: GemRequirementKey[];
  totalSatisfied: number;
  hasCompletedGem: boolean;
  gemRecordUpdatedAt?: string | null;
  generalTarget: number;
  generalTotal: number;
  role?: string;
}

interface GemStatusResponse {
  semesterName: string;
  startDate: string;
  endDate: string;
  generalTotal: number;
  generalTarget: number;
  rushTarget: number;
  members: GemMember[];
}

export default function GemDashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<GemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeFilters, setRangeFilters] = useState({
    start: "",
    end: "",
    semester: "",
  });
  const [gpaInputs, setGpaInputs] = useState<Record<string, string>>({});
  const [savingMember, setSavingMember] = useState<string | null>(null);
  const [hasSeededFilters, setHasSeededFilters] = useState(false);
  const [memberFilters, setMemberFilters] = useState({
    role: "all",
    name: "",
    gpa: "all",
    meeting: "all",
  });
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [detailMember, setDetailMember] = useState<GemMember | null>(null);
  const [gpaModalMember, setGpaModalMember] = useState<GemMember | null>(null);
  const [gpaModalValue, setGpaModalValue] = useState("");
  const [viewer, setViewer] = useState<{
    memberId: string;
    role: string;
    isECouncil: boolean;
  } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(true);
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);
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
          start: payload.startDate.split("T")[0],
          end: payload.endDate.split("T")[0],
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
    if (isLoaded && isSignedIn) {
      loadStatus();
    }
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
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
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

  useEffect(() => {
    if (!status) return;
    const nextInputs: Record<string, string> = {};
    status.members.forEach((member) => {
      nextInputs[member.memberId] =
        member.gem.gpa.value !== null ? String(member.gem.gpa.value) : "";
    });
    setGpaInputs(nextInputs);
  }, [status]);

  const handleSearch = () => {
    loadStatus(rangeFilters);
  };

  const formatDateShort = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US");
  };

  const handleUpdateGpa = async (memberId: string, valueOverride?: string) => {
    if (!status) return;
    const raw = valueOverride ?? gpaInputs[memberId];
    const payload: Record<string, any> = {
      memberId,
      semester: status.semesterName,
    };
    if (raw === "") {
      payload.gpa = null;
    } else {
      payload.gpa = Number(raw);
      if (Number.isNaN(payload.gpa)) {
        setError("GPA must be a valid number");
        return;
      }
    }
    setSavingMember(memberId);
    try {
      const res = await fetch("/api/gem/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error || "Failed to update GPA");
      }
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || "Unable to save GPA");
    } finally {
      setSavingMember(null);
    }
  };

  const handleSaveGpa = async () => {
    if (!gpaModalMember) return;
    await handleUpdateGpa(gpaModalMember.memberId, gpaModalValue);
    closeGpaModal();
  };

  const isPrivileged =
    viewer?.role === "admin" ||
    viewer?.role === "superadmin" ||
    Boolean(viewer?.isECouncil);

  const currentMember =
    viewer && status
      ? status.members.find((member) => member.memberId === viewer.memberId) || null
      : null;

  const buildRequirementCards = useCallback(
    (member: GemMember): RequirementCard[] => {
      if (!status) return [];
      const committeeDetails = member.gem.committee.details || [];
      const committeeCount = committeeDetails.length;
      const committeesSatisfied = committeeDetails.filter((detail) => detail.satisfied).length;
      const generalTarget = member.generalTarget || status.generalTarget || 0;
      const rushTarget = status.rushTarget || 0;
      const gpaThreshold = member.gem.gpa.threshold;
      const gpaValue = member.gem.gpa.value;

      return REQUIREMENT_KEYS.map((key) => {
        switch (key) {
          case "generalConference":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.general.satisfied,
              detail: `${member.gem.general.attended}/${generalTarget} attended`,
              hint: `General events scheduled: ${status.generalTotal}`,
            };
          case "committeeMeetings":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.committee.satisfied,
              detail: committeeCount
                ? `${committeesSatisfied}/${committeeCount} committees satisfied`
                : "No committees assigned yet",
            };
          case "brotherhood":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.brotherhood.satisfied,
              detail: `Attended: ${member.gem.brotherhood.attended}`,
            };
          case "service":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.service.satisfied,
              detail: `Attended: ${member.gem.service.attended}`,
            };
          case "professionalism":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.professionalism.satisfied,
              detail: `Attended: ${member.gem.professionalism.attended}`,
            };
          case "rush":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.rush.satisfied,
              detail: `Total: ${member.gem.rush.total}/${rushTarget}`,
              hint: `Events: ${member.gem.rush.eventCount} · Tabling: ${member.gem.rush.tablingCount}`,
            };
          case "fso":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.fso.satisfied,
              detail: `Attended: ${member.gem.fso.attended}`,
            };
          case "lockIn":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.lockIn.satisfied,
              detail: `Attended: ${member.gem.lockIn.attended}`,
            };
          case "gpa":
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: member.gem.gpa.satisfied,
              detail:
                gpaValue !== null
                  ? `GPA: ${gpaValue.toFixed(2)}`
                  : "GPA not recorded yet",
              hint: `Threshold: ${gpaThreshold.toFixed(1)}`,
            };
          default:
            return {
              key,
              label: REQUIREMENT_LABELS[key],
              satisfied: false,
              detail: "Not tracked yet",
            };
        }
      });
    },
    [status]
  );

  const viewerRequirementCards = useMemo<RequirementCard[]>(() => {
    if (!currentMember) return [];
    return buildRequirementCards(currentMember);
  }, [currentMember, buildRequirementCards]);

  useEffect(() => {
    if (!viewerRequirementCards.length) {
      setShowRequirementsModal(false);
    }
  }, [viewerRequirementCards.length]);

  const capitalizeNamePart = (value?: string) => {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  };

  const formatMemberName = (member: GemMember) => {
    const first = capitalizeNamePart(member.fName);
    const last = capitalizeNamePart(member.lName);
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    return fullName || "Unknown";
  };

  const memberRoleLabel = (member: GemMember) => member.status || "Active";

  const statusMembers = useMemo(() => status?.members || [], [status]);
  const visibleMembers = useMemo(
    () =>
      statusMembers.filter((member) => {
        return member.role !== "superadmin";
      }),
    [statusMembers]
  );
  const roleOptions = useMemo(() => {
    const options = new Set<string>();
    visibleMembers.forEach((member) => {
      options.add(memberRoleLabel(member));
    });
    return Array.from(options);
  }, [visibleMembers]);

  const filteredMembers = useMemo(() => {
    if (!visibleMembers.length) return [];
    const nameFilter = memberFilters.name.trim().toLowerCase();
    return visibleMembers.filter((member) => {
      const name = formatMemberName(member).toLowerCase();
      if (nameFilter && !name.includes(nameFilter)) {
        return false;
      }
      if (memberFilters.role !== "all" && memberRoleLabel(member) !== memberFilters.role) {
        return false;
      }
      const gpaValue = member.gem.gpa.value;
      if (memberFilters.gpa === "added" && gpaValue === null) {
        return false;
      }
      if (memberFilters.gpa === "missing" && gpaValue !== null) {
        return false;
      }
      if (memberFilters.meeting === "meeting" && !member.hasCompletedGem) {
        return false;
      }
      if (memberFilters.meeting === "not" && member.hasCompletedGem) {
        return false;
      }
      return true;
    });
  }, [visibleMembers, memberFilters]);

  const openDetailModal = (member: GemMember) => setDetailMember(member);
  const closeDetailModal = () => setDetailMember(null);
  const openGpaModal = (member: GemMember) => setGpaModalMember(member);
  const closeGpaModal = () => {
    setGpaModalMember(null);
    setGpaModalValue("");
  };

  useEffect(() => {
    if (!detailMember || !status) return;
    const refreshed = status.members.find(
      (member) => member.memberId === detailMember.memberId
    );
    if (refreshed && refreshed !== detailMember) {
      setDetailMember(refreshed);
    }
  }, [detailMember, status]);

  useEffect(() => {
    if (!gpaModalMember || !status) return;
    const refreshed = status.members.find(
      (member) => member.memberId === gpaModalMember.memberId
    );
    if (refreshed && refreshed !== gpaModalMember) {
      setGpaModalMember(refreshed);
    }
  }, [gpaModalMember, status]);

  useEffect(() => {
    if (!gpaModalMember) return;
    setGpaModalValue(gpaInputs[gpaModalMember.memberId] ?? "");
  }, [gpaInputs, gpaModalMember]);

  if (!isLoaded) {
    return <LoadingState message="Validating session..." />;
  }
  if (!isSignedIn) {
    return (
      <div className="container">
        <div className="alert alert-danger mt-5 d-flex align-items-center">
          <div>
            <h4>Please sign in to view GEM data.</h4>
            <p>Only committee leadership and EC can access this page.</p>
          </div>
          <div className="ms-auto">
            <RedirectToSignIn />
          </div>
        </div>
      </div>
    );
  }

  if (viewerLoading) {
    return <LoadingState message="Loading GEM standing..." />;
  }

  if (!isPrivileged) {
    return (
      <div className="member-dashboard gem-dashboard">
        <section className="bento-card gem-hero">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div>
              <p className="hero-eyebrow text-muted">GEM Tracker</p>
              <h1 className="hero-title mb-1">My GEM standing</h1>
              {status && (
                <p className="text-muted small mb-1">
                  Semester: {status.semesterName} (
                  {formatDateShort(status.startDate)} → {formatDateShort(status.endDate)})
                </p>
              )}
              {currentMember && (
                <p className="h5 mb-0">
                  {currentMember.totalSatisfied}/9 requirements satisfied
                </p>
              )}
            </div>
            <div className="d-flex flex-column align-items-end gap-2">
              {currentMember ? (
                <span
                  className={`badge ${
                    currentMember.hasCompletedGem ? "bg-success" : "bg-danger"
                  } fs-6 px-3 py-2`}
                >
                  {currentMember.hasCompletedGem ? "Meeting GEM" : "Not meeting GEM"}
                </span>
              ) : (
                <span className="text-muted small">GEM data pending</span>
              )}
            </div>
          </div>
          {error && (
            <div className="alert alert-warning mt-3 mb-0" role="alert">
              {error}
            </div>
          )}
          {loading && <LoadingState message="Loading GEM standings..." />}
        </section>
        {!loading && !currentMember && (
          <div className="alert alert-secondary mt-3" role="alert">
            Your GEM record is not yet available. Please check back with E-Council if you need assistance.
          </div>
        )}
        {!loading && currentMember && (
          <section className="bento-card mt-3">
            <div className="row g-3">
              {viewerRequirementCards.map((card) => (
                <div key={card.key} className="col-12 col-md-6 col-xl-4">
                  <article
                    className={`card h-100 shadow-sm border ${
                      card.satisfied ? "border-success" : "border-danger"
                    }`}
                  >
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h3 className="h6 mb-0">{card.label}</h3>
                        <span
                          className={`badge ${
                            card.satisfied ? "bg-success" : "bg-danger"
                          }`}
                        >
                          {card.satisfied ? "Complete" : "Incomplete"}
                        </span>
                      </div>
                      <p className="mb-1 text-muted">{card.detail}</p>
                      {card.hint && (
                        <small className="text-muted">{card.hint}</small>
                      )}
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </section>
        )}
        {showRequirementsModal && (
          <>
            <div
              className="modal fade show d-block"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-dialog modal-dialog-centered" role="document">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">GEM requirements</h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={() => setShowRequirementsModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    <ul className="list-group list-group-flush rounded-0">
                      {viewerRequirementCards.map((card) => (
                        <li key={card.key} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong>{card.label}</strong>
                            <span
                              className={`badge ${
                                card.satisfied ? "bg-success" : "bg-danger"
                              }`}
                            >
                              {card.satisfied ? "Met" : "Missing"}
                            </span>
                          </div>
                          <p className="mb-1 text-muted">{card.detail}</p>
                          {card.hint && (
                            <small className="text-muted">{card.hint}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowRequirementsModal(false)}
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
      </div>
    );
  }

  return (
    <div className="member-dashboard gem-dashboard">
      <section className="bento-card gem-hero">
        <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
          <div>
            <p className="hero-eyebrow text-muted">GEM Tracker</p>
            <h1 className="hero-title mb-1">GEM Tracker</h1>
            {status && (
              <p className="text-muted small mb-1">
                Semester: {status.semesterName} (
                {formatDateShort(status.startDate)} → {formatDateShort(status.endDate)})
              </p>
            )}
              <p className="text-muted small mb-0">
                Showing {filteredMembers.length} / {visibleMembers.length} members
              </p>
          </div>
          <div className="d-flex gap-2 align-items-center">
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "cards" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "list" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("list")}
            >
              List
            </button>
          </div>
        </div>
        <div className="border-top mt-3 pt-3">
          <div className="row g-3">
            <div className="col-sm-6 col-md-3 col-xl-2">
              <label className="form-label small text-muted">Role</label>
              <select
                className="form-select form-select-sm"
                value={memberFilters.role}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                <option value="all">All roles</option>
                {roleOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-md-4 col-xl-3">
              <label className="form-label small text-muted">Name</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search by name"
                value={memberFilters.name}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="col-sm-6 col-md-3 col-xl-2">
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
            <div className="col-sm-6 col-md-3 col-xl-2">
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
            <div className="col-sm-6 col-md-3 col-xl-2">
              <label className="form-label small text-muted">Semester</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g., Fall 2024"
                value={rangeFilters.semester}
                onChange={(e) =>
                  setRangeFilters((prev) => ({ ...prev, semester: e.target.value }))
                }
              />
            </div>
            <div className="col-sm-6 col-md-3 col-xl-2">
              <label className="form-label small text-muted">GPA</label>
              <select
                className="form-select form-select-sm"
                value={memberFilters.gpa}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, gpa: e.target.value }))
                }
              >
                {GPA_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-sm-6 col-md-3 col-xl-2">
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
              </select>
            </div>
          </div>
          <div className="d-flex justify-content-end mt-2">
            <button
              type="button"
              className="btn btn-primary px-4"
              onClick={handleSearch}
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
      <section className="bento-card mt-3">
        {viewMode === "cards" ? (
          filteredMembers.length === 0 ? (
            <p className="text-muted text-center py-4 mb-0">
              No members match the current filters.
            </p>
          ) : (
            <div className="row g-3">
              {filteredMembers.map((member) => {
                const isMeeting = member.hasCompletedGem;
                const needed = Math.max(0, 5 - member.totalSatisfied);
                const cardTheme = isMeeting
                  ? "gem-card--met"
                  : "gem-card--missed";
                const highlight = isMeeting
                  ? "gem-card__status--good"
                  : "gem-card__status--warn";
                return (
                  <div key={member.memberId} className="col-12 col-md-6 col-xl-4">
                    <article
                      className={`gem-card h-100 ${cardTheme}`}
                      role="button"
                      onClick={() => openDetailModal(member)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="card-body d-flex flex-column h-100">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{formatMemberName(member)}</strong>
                            <div className="text-muted small">{memberRoleLabel(member)}</div>
                            <div className="text-muted small">#{member.rollNo || "N/A"}</div>
                          </div>
                          <span className={`gem-card__status ${highlight}`}>
                            {isMeeting ? "Meeting GEM" : "Not meeting GEM"}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="mb-1 fw-semibold">{member.totalSatisfied}/9 satisfied</p>
                          <p className="text-muted small mb-2">Needs {needed} more</p>
                          <p className="text-muted small mb-1">
                            General: {member.gem.general.attended}/{member.generalTarget || member.gem.general.total}
                          </p>
                          <p className="text-muted small">
                            Rush: {member.gem.rush.total}/{status?.rushTarget ?? 0}
                          </p>
                          {member.committees.length > 0 && (
                            <p className="text-muted small mb-0">
                              {member.committees.join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="mt-auto d-flex justify-content-between align-items-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={(event) => {
                              event.stopPropagation();
                              openGpaModal(member);
                            }}
                          >
                            GPA
                          </button>
                          <small className="text-muted small mb-0">Tap card for details</small>
                        </div>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>GPA</th>
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
                      <div className="text-muted small">{memberRoleLabel(member)}</div>
                      <div className="text-muted small">#{member.rollNo || "N/A"}</div>
                    </td>
                    <td>
                      <div>{member.totalSatisfied}/9 satisfied</div>
                      <div className="text-muted small">Needs {Math.max(0, 5 - member.totalSatisfied)} more</div>
                      <div className="text-muted small">
                        General: {member.gem.general.attended}/{member.generalTarget || member.gem.general.total}
                      </div>
                      <div className="text-muted small">
                        Rush: {member.gem.rush.total}/{status?.rushTarget ?? 0}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${member.hasCompletedGem ? "bg-success" : "bg-danger"}`}>
                        {member.hasCompletedGem ? "Meeting GEM" : "Not meeting GEM"}
                      </span>
                      {member.committees.length > 0 && (
                        <div className="text-muted small mt-1">
                          {member.committees.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => openGpaModal(member)}
                      >
                        GPA
                      </button>
                      {member.gemRecordUpdatedAt && (
                        <div className="text-muted small mt-1">
                          Last saved: {new Date(member.gemRecordUpdatedAt).toLocaleDateString()}
                        </div>
                      )}
                      {!member.gemRecordUpdatedAt && member.gem.gpa.value !== null && (
                        <div className="text-muted small mt-1">Last saved: N/A</div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => openDetailModal(member)}
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
          <div
            className="modal fade show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-dialog-centered modal-xl" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title">GEM details — {formatMemberName(detailMember)}</h5>
                    <p className="text-muted small mb-0">
                      {memberRoleLabel(detailMember)} · #{detailMember.rollNo || "N/A"}
                    </p>
                    {detailMember.committees.length > 0 && (
                      <p className="text-muted small mb-0">
                        Committees: {detailMember.committees.join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={closeDetailModal}
                  />
                </div>
                <div className="modal-body">
                  <p className="mb-1">
                    {detailMember.totalSatisfied}/9 requirements satisfied.
                  </p>
                  <p className="text-muted small mb-3">
                    General: {detailMember.gem.general.attended}/{detailMember.generalTarget || detailMember.gem.general.total} · Rush: {detailMember.gem.rush.total}/{status?.rushTarget ?? 0}
                  </p>
                  <div className="row g-3">
                    {buildRequirementCards(detailMember).map((card) => (
                      <div key={card.key} className="col-12 col-md-6">
                        <article className="card h-100 border">
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h3 className="h6 mb-0">{card.label}</h3>
                              <span
                                className={`badge ${
                                  card.satisfied ? "bg-success" : "bg-danger"
                                }`}
                              >
                                {card.satisfied ? "Complete" : "Incomplete"}
                              </span>
                            </div>
                            <p className="mb-1 text-muted">{card.detail}</p>
                            {card.hint && <small className="text-muted">{card.hint}</small>}
                          </div>
                        </article>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => openGpaModal(detailMember)}
                  >
                    GPA
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeDetailModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
      {gpaModalMember && (
        <>
          <div
            className="modal fade show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">GPA for {formatMemberName(gpaModalMember)}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={closeGpaModal}
                  />
                </div>
                <div className="modal-body">
                  <p className="text-muted small mb-2">
                    Threshold: {gpaModalMember.gem.gpa.threshold.toFixed(1)}
                  </p>
                  {gpaModalMember.gemRecordUpdatedAt && (
                    <p className="text-muted small mb-3">
                      Last saved: {new Date(gpaModalMember.gemRecordUpdatedAt).toLocaleDateString()}
                    </p>
                  )}
                  <label className="form-label">GPA</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.01}
                    className="form-control"
                    value={gpaModalValue}
                    onChange={(e) => setGpaModalValue(e.target.value)}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveGpa}
                    disabled={savingMember === gpaModalMember.memberId}
                  >
                    {savingMember === gpaModalMember.memberId ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeGpaModal}>
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
