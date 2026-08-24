"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import LoadingState from "../../components/LoadingState";
import {
  GemCommitteeList,
  GemSheet,
  GemStatusBadge,
  STANDING_BADGES,
  STANDING_LABELS,
  formatDateShort,
  gemVerdictLine,
  type GemMember,
  type GemStatusResponse,
} from "../../components/GemSheet";

/// The member's own GEM sheet.
///
/// Read-only by design: attendance comes from check-ins at the door, the dues
/// point comes from the ledger, and a Section 2 substitution comes from a
/// chapter vote. Nothing on this page is a thing a member records about
/// themselves.
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
  const [viewer, setViewer] = useState<{ memberId: string } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(true);
  const rangeFiltersRef = useRef(rangeFilters);
  const hasSeededFiltersRef = useRef(hasSeededFilters);

  const loadStatus = useCallback(
    async (overrides?: Partial<typeof rangeFilters>) => {
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
        // Officers get the whole chapter back by default; scoping to the viewer
        // is what makes this page their own sheet rather than the first row of
        // somebody else's.
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
    },
    [viewer]
  );

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
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setViewer({ memberId: data.memberId });
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

  const currentMember: GemMember | null =
    viewer && status
      ? status.members.find((member) => member.memberId === viewer.memberId) || null
      : null;

  if (!isLoaded) {
    return <LoadingState message="Validating session..." />;
  }
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
                Semester: {status.semesterName} ({formatDateShort(status.startDate)} →{" "}
                {formatDateShort(status.endDate)})
              </p>
            )}
            {currentMember && (
              <>
                <p className="h5 mb-1">
                  {currentMember.pointsEarned}/{currentMember.pointsRequired} points
                  <span className="text-muted fs-6">
                    {" "}
                    (of {currentMember.pointsAvailable})
                  </span>
                </p>
                <p className="text-muted small mb-0">{gemVerdictLine(currentMember)}</p>
              </>
            )}
          </div>
          <div className="d-flex flex-column align-items-md-end gap-2">
            {currentMember ? (
              <>
                <GemStatusBadge member={currentMember} className="fs-6 px-3 py-2" />
                {currentMember.standing !== "none" && (
                  <span className={`badge ${STANDING_BADGES[currentMember.standing]}`}>
                    {STANDING_LABELS[currentMember.standing]}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted small">GEM data pending</span>
            )}
          </div>
        </div>
        {currentMember?.standing !== "none" && currentMember?.standingNote && (
          <div className="alert alert-warning mt-3 mb-0" role="alert">
            <strong>Probation goals:</strong> {currentMember.standingNote}
          </div>
        )}
        {error && (
          <div className="alert alert-warning mt-3 mb-0" role="alert">
            {error}
          </div>
        )}
        {loading && <LoadingState message="Loading GEM standings..." />}
      </section>

      {!loading && !currentMember && (
        <div className="alert alert-secondary mt-3" role="alert">
          Your GEM record is not yet available. Please check back with E-Council if you
          need assistance.
        </div>
      )}

      {!loading && currentMember && (
        <>
          <section className="bento-card mt-3">
            <GemSheet member={currentMember} />
          </section>

          <section className="bento-card mt-3">
            <h2 className="h5 mb-3">Committee meetings</h2>
            <GemCommitteeList member={currentMember} />
          </section>

          <section className="bento-card mt-3">
            <h2 className="h5 mb-2">How GEM works</h2>
            <p className="text-muted small mb-2">
              Article V of the chapter bylaws. Every member must meet both requirements
              and earn {currentMember.pointsRequired} of the{" "}
              {currentMember.pointsAvailable} points each semester. Attendance comes from
              event check-ins, and the dues point comes from the ledger.
            </p>
            <p className="text-muted small mb-0">
              A requirement or point may be replaced by a service to the chapter under
              Section 2, documented in writing, presented at a general meeting, and
              approved by a majority vote. Approved substitutions show as{" "}
              <span className="badge bg-primary">Chapter vote</span> above.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
