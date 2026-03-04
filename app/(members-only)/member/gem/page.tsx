"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import LoadingState, { LoadingSpinner } from "../../components/LoadingState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";

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
  const [hasSeededFilters, setHasSeededFilters] = useState(false);
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
      // Only show the viewer's own GEM data
      if (viewer?.memberId) {
        params.set("memberId", viewer.memberId);
      }
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
  }, [viewer]);

  useEffect(() => {
    if (isLoaded && isSignedIn && viewer && !viewerLoading) {
      loadStatus();
    }
  }, [isLoaded, isSignedIn, viewer, viewerLoading, loadStatus]);

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

  const handleSearch = () => {
    loadStatus(rangeFilters);
  };

  const formatDateShort = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US");
  };



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

  return (
    <div className="member-dashboard gem-dashboard">
      <section className="bento-card gem-hero">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div>
              <p className="hero-eyebrow text-muted">GEM Tracker</p>
              <h1 className="hero-title mb-1">GEM Status</h1>
              {status && (
                <p className="text-muted small mb-1">
                  Semester: {status.semesterName} (
                  {formatDateShort(status.startDate)} → {formatDateShort(status.endDate)})
                </p>
              )}
              {currentMember && (
                <p className="h5 mb-0">
                  {currentMember.totalSatisfied}/5 requirements satisfied
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
                  <FontAwesomeIcon
                    icon={currentMember.hasCompletedGem ? faCheck : faTimes}
                    className="me-2"
                  />
                  {currentMember.hasCompletedGem ? "GEM Satisfied" : "GEM Not Satisfied"}
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
