"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { LayoutGrid, List, Search, ShieldAlert, TriangleAlert } from "lucide-react";

import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { cn } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
    () => status?.members || [],
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
  if (viewerLoading) return <LoadingState message="Loading GEM data..." />;
  if (!canRead) {
    return (
      <PageContainer>
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>
            Only administrators and E-Council members can access the chapter GEM
            board.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const statBlocks = [
    {
      label: "Meeting GEM",
      value: gemStats.met,
      pct: gemStats.metPct,
      bar: "bg-emerald-600 dark:bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
      badge: "success" as const,
    },
    {
      label: "Requirement short",
      value: gemStats.requirementShort,
      pct: gemStats.requirementShortPct,
      bar: "bg-destructive",
      text: "text-destructive",
      badge: "destructive" as const,
    },
    {
      label: "1 point away",
      value: gemStats.onePoint,
      pct: gemStats.onePointPct,
      bar: "bg-primary",
      text: "text-primary",
      badge: "default" as const,
    },
    {
      label: "2+ points away",
      value: gemStats.morePoints,
      pct: gemStats.morePointsPct,
      bar: "bg-amber-500 dark:bg-amber-400",
      text: "text-amber-700 dark:text-amber-400",
      badge: "warning" as const,
    },
  ];

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Manage GEM"
        description={
          status
            ? `${status.semesterName} · ${formatDateShort(
                status.startDate
              )} to ${formatDateShort(status.endDate)}`
            : "Chapter GEM board."
        }
        actions={
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as "cards" | "list")}
          >
            <TabsList aria-label="Board layout">
              <TabsTrigger value="cards" className="gap-2">
                <LayoutGrid className="size-4" />
                Cards
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="size-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {status && (
        <p className="text-sm text-muted-foreground">
          {status.totals.generalTotal} general meetings held ·{" "}
          {status.totals.generalRequired} required ·{" "}
          {status.totals.pnmMeetingTotal} PNM meetings held · showing{" "}
          {filteredMembers.length} of {visibleMembers.length} members
          {!canManage && " · read only"}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Narrow the board, or reload it for a different date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="gem-name">Name or roll</Label>
              <Input
                id="gem-name"
                type="text"
                placeholder="Search"
                value={memberFilters.name}
                onChange={(e) =>
                  setMemberFilters((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gem-committee">Committee</Label>
              <Select
                value={memberFilters.committee}
                onValueChange={(value) =>
                  setMemberFilters((prev) => ({ ...prev, committee: value }))
                }
              >
                <SelectTrigger id="gem-committee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All committees</SelectItem>
                  {committeeOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gem-standing">Standing</Label>
              <Select
                value={memberFilters.standing}
                onValueChange={(value) =>
                  setMemberFilters((prev) => ({ ...prev, standing: value }))
                }
              >
                <SelectTrigger id="gem-standing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STANDING_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gem-status">GEM status</Label>
              <Select
                value={memberFilters.meeting}
                onValueChange={(value) =>
                  setMemberFilters((prev) => ({ ...prev, meeting: value }))
                }
              >
                <SelectTrigger id="gem-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="meeting">Meeting GEM</SelectItem>
                  <SelectItem value="not">Not meeting GEM</SelectItem>
                  <SelectItem value="requirements">
                    Requirement not met
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="gem-start">Start date</Label>
              <DatePicker
                id="gem-start"
                value={rangeFilters.start}
                placeholder="Any start"
                clearable
                onChange={(value) =>
                  setRangeFilters((prev) => ({ ...prev, start: value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gem-end">End date</Label>
              <DatePicker
                id="gem-end"
                value={rangeFilters.end}
                placeholder="Any end"
                clearable
                onChange={(value) =>
                  setRangeFilters((prev) => ({ ...prev, end: value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gem-semester">Semester</Label>
              <Input
                id="gem-semester"
                type="text"
                placeholder="e.g., Fall 2026"
                value={rangeFilters.semester}
                onChange={(e) =>
                  setRangeFilters((prev) => ({
                    ...prev,
                    semester: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => loadStatus(rangeFilters)}
                disabled={loading}
                className="w-full"
              >
                {loading ? <LoadingSpinner size="sm" /> : <Search aria-hidden="true" />}
                {loading ? "Searching…" : "Search"}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="warning" role="alert">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {loading && <LoadingState message="Loading GEM standings..." />}

      {!loading && status && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Chapter overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statBlocks.map((block) => (
              <Card key={block.label}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm font-semibold", block.text)}>
                      {block.label}
                    </p>
                    <Badge variant={block.badge}>{block.value}</Badge>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(block.pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${block.label}: ${block.pct.toFixed(
                      0
                    )} percent of active members`}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn("h-full rounded-full", block.bar)}
                      style={{ width: `${block.pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {block.value} of {gemStats.total} active members (
                    {block.pct.toFixed(1)}%)
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {viewMode === "cards" ? (
        filteredMembers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">No members match the current filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search, committee, or standing.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMembers.map((member) => (
              <li key={member.memberId} className="min-w-0">
                <GemMemberCard member={member} onOpen={setDetailMember} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Member</TableHead>
                    <TableHead>Requirements</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center">
                        <p className="font-medium">
                          No members match the current filters
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Try a different search, committee, or standing.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
                      <TableRow key={member.memberId}>
                        <TableCell className="pl-6">
                          <p className="font-semibold text-foreground">
                            {formatMemberName(member)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            #{member.rollNo || "N/A"}
                          </p>
                          {member.committees.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {member.committees.join(" · ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              member.requirementsMet ? "success" : "destructive"
                            }
                          >
                            {member.requirementsMet ? "Met" : "Not met"}
                          </Badge>
                          {!member.requirementsMet && (
                            <p
                              className={cn(
                                "mt-1 text-xs",
                                gemVerdictTone(member)
                              )}
                            >
                              {gemShortVerdict(member)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="tabular-nums">
                            {member.pointsEarned}/{member.pointsRequired}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            of {member.pointsAvailable} available
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            <GemStatusBadge member={member} />
                            {member.standing !== "none" && (
                              <Badge variant={STANDING_BADGES[member.standing]}>
                                {STANDING_LABELS[member.standing]}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailMember(member)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── GEM sheet ── */}
      <Dialog
        open={detailMember !== null}
        onOpenChange={(next) => {
          if (!next) setDetailMember(null);
        }}
      >
        {detailMember && (
          <DialogContent className="grid max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
              <DialogTitle>
                GEM sheet: {formatMemberName(detailMember)}
              </DialogTitle>
              <DialogDescription>
                #{detailMember.rollNo || "N/A"}
                {detailMember.ecouncilPosition
                  ? ` · ${detailMember.ecouncilPosition}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <GemStatusBadge member={detailMember} />
                <Badge variant={STANDING_BADGES[detailMember.standing]}>
                  {STANDING_LABELS[detailMember.standing]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {gemVerdictLine(detailMember)}
                </span>
              </div>

              {detailMember.standingNote && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  <AlertTitle>Goals</AlertTitle>
                  <AlertDescription>
                    {detailMember.standingNote}
                  </AlertDescription>
                </Alert>
              )}

              <GemSheet
                member={detailMember}
                onManage={canManage ? openOverride(detailMember) : undefined}
              />

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Committee meetings
                </h3>
                <GemCommitteeList member={detailMember} />
              </div>

              <p className="text-xs text-muted-foreground">
                Recorded GPA:{" "}
                {detailMember.gpa.value !== null
                  ? detailMember.gpa.value.toFixed(2)
                  : "not recorded"}
                . Not scored under the current bylaws.
                {detailMember.gemRecordUpdatedAt && (
                  <>
                    {" "}
                    Last saved{" "}
                    {new Date(
                      detailMember.gemRecordUpdatedAt
                    ).toLocaleDateString()}
                    .
                  </>
                )}
              </p>
            </div>

            <DialogFooter className="gap-2 border-t border-border px-6 py-4">
              {canManage && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStandingValue(detailMember.standing);
                      setStandingNote(detailMember.standingNote || "");
                      setStandingTarget(detailMember);
                    }}
                  >
                    Standing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
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
                  </Button>
                </>
              )}
              <Button type="button" onClick={() => setDetailMember(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Section 2 substitution ── */}
      <Dialog
        open={overrideTarget !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setOverrideTarget(null);
        }}
      >
        {overrideTarget && (
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-lg"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Section 2 substitution</DialogTitle>
              <DialogDescription>
                {overrideTarget.criterion.label} ·{" "}
                {formatMemberName(overrideTarget.member)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A member may replace a requirement with a service to the
                chapter, documented in writing and presented verbally at a
                general meeting, approved by a majority vote. Record the outcome
                of that vote here.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="gem-override-outcome">Outcome</Label>
                <Select
                  value={overrideGranted ? "granted" : "denied"}
                  onValueChange={(value) =>
                    setOverrideGranted(value === "granted")
                  }
                >
                  <SelectTrigger id="gem-override-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="granted">
                      Chapter approved the substitution
                    </SelectItem>
                    <SelectItem value="denied">
                      Chapter denied it (mark unmet)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gem-override-note">Written documentation</Label>
                <Textarea
                  id="gem-override-note"
                  rows={4}
                  placeholder="What service was performed, and when the chapter voted."
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              {overrideTarget.criterion.overridden ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => saveOverride(true)}
                  disabled={saving}
                >
                  Remove substitution
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOverrideTarget(null)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => saveOverride(false)}
                  disabled={saving}
                >
                  {saving && <LoadingSpinner size="sm" />}
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Section 3 standing ── */}
      <Dialog
        open={standingTarget !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setStandingTarget(null);
        }}
      >
        {standingTarget && (
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-lg"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>
                Standing: {formatMemberName(standingTarget)}
              </DialogTitle>
              <DialogDescription>
                Section 3 standing and Membership Integrity goals.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="gem-standing-value">Section 3 standing</Label>
                <Select
                  value={standingValue}
                  onValueChange={(value) =>
                    setStandingValue(value as GemStandingValue)
                  }
                >
                  <SelectTrigger
                    id="gem-standing-value"
                    aria-describedby="gem-standing-hint"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEM_STANDINGS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STANDING_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p
                  id="gem-standing-hint"
                  className="text-xs text-muted-foreground"
                >
                  Cooldown is the semester after a probation. A member on
                  cooldown who fails GEM again skips the first round of voting.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gem-standing-note">
                  Membership Integrity goals (up to 3)
                </Label>
                <Textarea
                  id="gem-standing-note"
                  rows={4}
                  value={standingNote}
                  onChange={(e) => setStandingNote(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStandingTarget(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveStanding} disabled={saving}>
                {saving && <LoadingSpinner size="sm" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Recorded GPA ── */}
      <Dialog
        open={gpaTarget !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setGpaTarget(null);
        }}
      >
        {gpaTarget && (
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-md"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>GPA for {formatMemberName(gpaTarget)}</DialogTitle>
              <DialogDescription>
                Recorded for the chapter&apos;s own reference. The 3.0 GPA point
                was removed from GEM, so this does not affect the sheet.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="gem-gpa">GPA</Label>
              <Input
                id="gem-gpa"
                type="number"
                min={0}
                max={4}
                step={0.01}
                value={gpaValue}
                onChange={(e) => setGpaValue(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGpaTarget(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveGpa} disabled={saving}>
                {saving && <LoadingSpinner size="sm" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageContainer>
  );
}
