"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { Info, ShieldAlert, TriangleAlert } from "lucide-react";

import LoadingState from "../../components/LoadingState";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <PageContainer>
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Sign-in required</AlertTitle>
          <AlertDescription>
            Please sign in to view GEM data.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (viewerLoading) {
    return <LoadingState message="Loading GEM standing..." />;
  }

  return (
    <PageContainer className="max-w-6xl space-y-6">
      <PageHeader
        title="GEM status"
        description={
          status
            ? `${status.semesterName} · ${formatDateShort(
                status.startDate
              )} to ${formatDateShort(status.endDate)}`
            : "Your standing under Article V."
        }
        actions={
          currentMember ? (
            <div className="flex flex-wrap items-center gap-2">
              <GemStatusBadge member={currentMember} />
              {currentMember.standing !== "none" && (
                <Badge variant={STANDING_BADGES[currentMember.standing]}>
                  {STANDING_LABELS[currentMember.standing]}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              GEM data pending
            </span>
          )
        }
      />

      {currentMember && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {currentMember.pointsEarned}/{currentMember.pointsRequired}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              points (of {currentMember.pointsAvailable})
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {gemVerdictLine(currentMember)}
          </p>
        </div>
      )}

      {currentMember?.standing !== "none" && currentMember?.standingNote && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Probation goals</AlertTitle>
          <AlertDescription>{currentMember.standingNote}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="warning" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && <LoadingState message="Loading GEM standings..." />}

      {!loading && !currentMember && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>GEM record not available yet</AlertTitle>
          <AlertDescription>
            Please check back with E-Council if you need assistance.
          </AlertDescription>
        </Alert>
      )}

      {!loading && currentMember && (
        <>
          <GemSheet member={currentMember} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Committee meetings</CardTitle>
            </CardHeader>
            <CardContent>
              <GemCommitteeList member={currentMember} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How GEM works</CardTitle>
              <CardDescription>Article V of the chapter bylaws.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Every member must meet both requirements and earn{" "}
                {currentMember.pointsRequired} of the{" "}
                {currentMember.pointsAvailable} points each semester. Attendance
                comes from event check-ins, and the dues point comes from the
                ledger.
              </p>
              <p>
                A requirement or point may be replaced by a service to the
                chapter under Section 2, documented in writing, presented at a
                general meeting, and approved by a majority vote. Approved
                substitutions are marked with a gavel icon above.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
