"use client";

import * as React from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  ListChecks,
  LockKeyholeOpen,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import LoadingState from "../../components/LoadingState";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";

import * as api from "./api";
import { BallotPanel } from "./BallotPanel";
import { ControlPanel } from "./ControlPanel";
import { CreateVoteDialog } from "./CreateVoteDialog";
import { LocationsPanel } from "./LocationsPanel";
import { ResultsPanel } from "./ResultsPanel";
import { RollPanel } from "./RollPanel";
import { Figure, KIND_ICON, StageBadge, VoteFlag } from "./pieces";
import {
  KIND_TITLE,
  STAGE_HEADING,
  displayTitle,
  elapsedLabel,
  hasSubmittedBallot,
  purgeLabel,
  stageOf,
  type VoteDetail,
  type VoteStage,
  type VoteSummary,
} from "./types";

/**
 * The chapter's voting, on one page.
 *
 * Every vote is in the list on the left and everything about the selected one
 * is on the right — ballot, controls, roll, map, results — with the tabs a
 * member cannot use simply absent rather than present and refusing. The iOS
 * app splits the same material across pushed screens because a phone has no
 * room for two columns; the steps, the wording and the order are the same.
 */

interface Me {
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
  status?: string;
}

/** How often the list re-reads while somebody is looking at it. */
const LIST_POLL_MS = 15_000;
/** The open vote's own detail, which carries the ballot count and the clock. */
const DETAIL_POLL_MS = 10_000;
/** While a countdown is running, the same detail but often enough to matter. */
const COUNTDOWN_POLL_MS = 3_000;

type PanelTab = "ballot" | "manage" | "roll" | "locations" | "results";

export default function VoteWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();

  const [me, setMe] = React.useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = React.useState(true);

  const [votes, setVotes] = React.useState<VoteSummary[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<VoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<PanelTab>("ballot");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  // ---- permissions, the same rules the API enforces ----
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const position = (me?.ecouncilPosition ?? "").toLowerCase();
  /** Create, open, end, relocate, delete — and read a tally. */
  const canRunVotes =
    !!me && (isAdmin || position.includes("regent") || position.includes("scribe"));
  /** Strike a ballot and sign off the roll. */
  const canReviewBallots = !!me?.isECouncil;
  const canSnapBid = position.includes("regent");

  React.useEffect(() => {
    if (!isSignedIn) return;
    let active = true;

    fetch("/api/members/me")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setMe({
          role: data.role,
          isECouncil: data.isECouncil,
          ecouncilPosition: data.ecouncilPosition,
          status: data.status,
        });
      })
      .catch(() => {
        if (active) setMe(null);
      })
      .finally(() => {
        if (active) setLoadingMe(false);
      });

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  const loadVotes = React.useCallback(
    async (showLoading = false) => {
      if (showLoading) setListLoading(true);
      try {
        const fresh = await api.listVotes();
        setVotes(fresh);
        setListError(null);
        return fresh;
      } catch (err) {
        // A failed background refresh must not replace a list somebody is
        // reading with an error panel.
        if (showLoading) {
          setListError(err instanceof Error ? err.message : "Votes could not be loaded.");
        }
        return null;
      } finally {
        if (showLoading) setListLoading(false);
      }
    },
    []
  );

  const loadDetail = React.useCallback(
    async (voteId: string, showLoading = false) => {
      if (showLoading) setDetailLoading(true);
      try {
        const fresh = await api.voteDetail(voteId);
        setDetail(fresh);
        setDetailError(null);
      } catch (err) {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "That vote could not be loaded.");
      } finally {
        if (showLoading) setDetailLoading(false);
      }
    },
    []
  );

  // First load, and the pick of a sensible vote: whatever is open and still
  // wants this member's ballot, else the newest thing in the list.
  React.useEffect(() => {
    if (!isSignedIn) return;
    let active = true;

    void loadVotes(true).then((fresh) => {
      if (!active || !fresh?.length) return;
      setSelectedId((current) => {
        if (current && fresh.some((vote) => vote._id === current)) return current;
        const open = fresh.filter((vote) => stageOf(vote) === "open");
        const waiting = open.find((vote) => !vote.hasVoted);
        return (waiting ?? open[0] ?? [...fresh].reverse()[0])._id;
      });
    });

    return () => {
      active = false;
    };
  }, [isSignedIn, loadVotes]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId, true);
  }, [selectedId, loadDetail]);

  // A vote opens, or closes, while somebody is looking at the list — so the
  // list has to notice. Paused when the tab is hidden: a background tab
  // polling every fifteen seconds is a bill nobody agreed to.
  React.useEffect(() => {
    if (!isSignedIn) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer || document.hidden) return;
      timer = setInterval(() => void loadVotes(false), LIST_POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void loadVotes(false);
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isSignedIn, loadVotes]);

  // The selected vote's own detail. Only worth re-reading while it is open:
  // a closed vote does not change, and a locked one changes when its officer
  // does something on this very page.
  const countdownRunning = !!detail?.endTime && !detail.ended;
  React.useEffect(() => {
    if (!selectedId || !detail || stageOf(detail) !== "open") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer || document.hidden) return;
      timer = setInterval(
        () => void loadDetail(selectedId),
        countdownRunning ? COUNTDOWN_POLL_MS : DETAIL_POLL_MS
      );
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void loadDetail(selectedId);
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedId, detail, countdownRunning, loadDetail]);

  // The running clock in the header. One interval for the page rather than one
  // per figure, and only while something is actually counting.
  React.useEffect(() => {
    if (!detail || stageOf(detail) !== "open") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [detail]);

  // The server closes a vote on its own timer and has no way to tell a
  // browser, so without this a member could sit on a live-looking ballot and
  // have Send rejected by a vote that ended a minute ago.
  React.useEffect(() => {
    if (!detail?.endTime || detail.ended || !selectedId) return;
    const remaining = new Date(detail.endTime).getTime() - Date.now();
    if (remaining > 0 && remaining < 60_000) {
      const timer = setTimeout(() => {
        void loadDetail(selectedId);
        void loadVotes(false);
      }, remaining + 600);
      return () => clearTimeout(timer);
    }
  }, [detail?.endTime, detail?.ended, selectedId, loadDetail, loadVotes]);

  const refresh = React.useCallback(async () => {
    await Promise.all([
      loadVotes(false),
      selectedId ? loadDetail(selectedId) : Promise.resolve(),
    ]);
  }, [loadVotes, loadDetail, selectedId]);

  const summary = votes.find((vote) => vote._id === selectedId);
  const stage = detail ? stageOf(detail) : null;
  const newestVoteId = React.useMemo(() => {
    if (!votes.length) return null;
    return [...votes].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    )[0]._id;
  }, [votes]);

  // Which tabs this member can use on this vote. A tab that would only ever
  // return a 403 is not shown at all.
  const tabs = React.useMemo(() => {
    const available: { id: PanelTab; label: string }[] = [{ id: "ballot", label: "Ballot" }];
    if (canRunVotes) available.push({ id: "manage", label: "Manage" });
    if (canReviewBallots && stage === "closed") available.push({ id: "roll", label: "Roll" });
    if (canRunVotes && stage === "closed") {
      available.push({ id: "locations", label: "Locations" });
      available.push({ id: "results", label: "Results" });
    }
    return available;
  }, [canRunVotes, canReviewBallots, stage]);

  React.useEffect(() => {
    if (!tabs.some((option) => option.id === tab)) setTab(tabs[0]?.id ?? "ballot");
  }, [tabs, tab]);

  if (!isLoaded) return <LoadingState message="Loading voting..." />;

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>You must be signed in to vote.</AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (loadingMe) return <LoadingState message="Loading voting..." />;

  const awaitingBallot = votes.filter(
    (vote) => stageOf(vote) === "open" && !vote.hasVoted
  ).length;

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Voting"
        description="Every vote the chapter has run, and the one it is running now."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            {canRunVotes ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New vote
              </Button>
            ) : null}
          </>
        }
      />

      {awaitingBallot > 0 ? (
        <Alert className="mb-6">
          <ListChecks className="size-4" />
          <AlertTitle>
            {awaitingBallot === 1
              ? "One vote is waiting on your ballot"
              : `${awaitingBallot} votes are waiting on your ballot`}
          </AlertTitle>
          <AlertDescription>Open it in the list to cast it.</AlertDescription>
        </Alert>
      ) : null}

      {listError ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert className="size-4" />
          <AlertTitle>Votes could not be loaded</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <VoteList
          votes={votes}
          loading={listLoading}
          selectedId={selectedId}
          showArchived={canRunVotes}
          onSelect={(id) => setSelectedId(id)}
        />

        <div className="min-w-0">
          {detailLoading && !detail ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : detailError ? (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertTitle>That vote could not be loaded</AlertTitle>
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : !detail ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
                <ListChecks className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-lg font-semibold">
                  {votes.length ? "Pick a vote" : "No votes yet"}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {votes.length
                    ? "Choose one from the list to see its ballot."
                    : canRunVotes
                    ? "Create one when the chapter is ready to decide something."
                    : "E-Council will start one when the chapter has something to decide."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <VoteHeaderCard vote={detail} now={now} />

              <Tabs value={tab} onValueChange={(value) => setTab(value as PanelTab)}>
                {tabs.length > 1 ? (
                  <TabsList className="mb-4">
                    {tabs.map((option) => (
                      <TabsTrigger key={option.id} value={option.id}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                ) : null}

                <TabsContent value="ballot" className="mt-0">
                  <BallotPanel vote={detail} onChanged={refresh} />
                </TabsContent>

                {canRunVotes ? (
                  <TabsContent value="manage" className="mt-0">
                    <ControlPanel
                      vote={detail}
                      summary={summary}
                      canSnapBid={canSnapBid}
                      isNewestVote={detail._id === newestVoteId}
                      onChanged={refresh}
                      onDeleted={async () => {
                        setSelectedId(null);
                        setDetail(null);
                        await loadVotes(false);
                      }}
                      onReview={() => setTab("roll")}
                    />
                  </TabsContent>
                ) : null}

                {canReviewBallots && stage === "closed" ? (
                  <TabsContent value="roll" className="mt-0">
                    <RollPanel
                      voteId={detail._id}
                      onChanged={refresh}
                      onVerified={() => setTab("results")}
                    />
                  </TabsContent>
                ) : null}

                {canRunVotes && stage === "closed" ? (
                  <>
                    <TabsContent value="locations" className="mt-0">
                      <LocationsPanel voteId={detail._id} />
                    </TabsContent>
                    <TabsContent value="results" className="mt-0">
                      <ResultsPanel
                        voteId={detail._id}
                        sealed={!detail.voterListVerified}
                      />
                    </TabsContent>
                  </>
                ) : null}
              </Tabs>
            </div>
          )}
        </div>
      </div>

      <CreateVoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (voteId) => {
          await loadVotes(false);
          setSelectedId(voteId);
          setTab("manage");
        }}
      />
    </PageContainer>
  );
}

/**
 * Every vote, ordered by what needs answering rather than by when it was made:
 * a vote that is open right now is the reason anybody opened this page, and a
 * vote closed last term is history.
 */
function VoteList({
  votes,
  loading,
  selectedId,
  showArchived,
  onSelect,
}: {
  votes: VoteSummary[];
  loading: boolean;
  selectedId: string | null;
  showArchived: boolean;
  onSelect: (id: string) => void;
}) {
  const sections = React.useMemo(() => {
    const groups: { key: string; heading: string; rows: VoteSummary[] }[] = [];
    const newestFirst = (a: VoteSummary, b: VoteSummary) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();

    for (const stage of ["open", "locked", "closed"] as VoteStage[]) {
      const rows = votes
        .filter((vote) => stageOf(vote) === stage)
        // Archived rows are out of the way, but still readable — and only for
        // the officers who can do anything about them.
        .filter((vote) => (stage === "closed" ? !vote.archived : true))
        .sort(newestFirst);
      if (rows.length) groups.push({ key: stage, heading: STAGE_HEADING[stage], rows });
    }

    if (showArchived) {
      const archived = votes.filter((vote) => vote.archived).sort(newestFirst);
      if (archived.length) {
        groups.push({ key: "archived", heading: "Archived", rows: archived });
      }
    }

    return groups;
  }, [votes, showArchived]);

  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardHeader className="border-b">
        <CardTitle className="text-base">Votes</CardTitle>
        <CardDescription>
          {votes.length === 1 ? "1 vote" : `${votes.length} votes`}
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[70vh] overflow-y-auto p-0">
        {loading && !votes.length ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !votes.length ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            No votes yet.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              <p className="border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.heading}
              </p>
              {section.rows.map((vote) => (
                <VoteRow
                  key={vote._id}
                  vote={vote}
                  selected={vote._id === selectedId}
                  onSelect={() => onSelect(vote._id)}
                />
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function VoteRow({
  vote,
  selected,
  onSelect,
}: {
  vote: VoteSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = KIND_ICON[vote.type];
  const purge = vote.archived ? purgeLabel(vote.purgeAt) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent"
      )}
    >
      <span className="rounded-md bg-muted p-2 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{displayTitle(vote)}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {/* The stage is already the heading above this row, so saying it
            * again here would be the same word twice on one screen. Only the
            * member's own standing goes on the second line. */}
          {vote.hasVoted ? (
            <VoteFlag icon={CheckCircle2} tone="positive">
              Voted
            </VoteFlag>
          ) : vote.proxyStatus === "approved" ? (
            <VoteFlag icon={LockKeyholeOpen} tone="positive">
              Proxy approved
            </VoteFlag>
          ) : vote.proxyStatus === "pending" ? (
            <VoteFlag icon={Clock} tone="caution">
              Proxy requested
            </VoteFlag>
          ) : (
            <span>{purge ?? KIND_TITLE[vote.type]}</span>
          )}
        </span>
      </span>
      {vote.pendingProxyCount > 0 && stageOf(vote) === "locked" ? (
        <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-destructive-foreground">
          {vote.pendingProxyCount}
        </span>
      ) : null}
    </button>
  );
}

/**
 * What is being decided, and how long there is to decide it.
 *
 * The stage is the largest secondary thing on the card, under the title,
 * because it is the fact that changes what every other control on the page
 * means.
 */
function VoteHeaderCard({ vote, now }: { vote: VoteDetail; now: number }) {
  const stage = stageOf(vote);
  const startedAt = vote.startedAt ? new Date(vote.startedAt).getTime() : null;
  const endTime = vote.endTime ? new Date(vote.endTime).getTime() : null;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {KIND_TITLE[vote.type]}
          </span>
          <StageBadge stage={stage} />
          {hasSubmittedBallot(vote) ? (
            <VoteFlag icon={CheckCircle2} tone="positive">
              Your ballot is in
            </VoteFlag>
          ) : null}
        </div>
        <CardTitle className="text-2xl">{displayTitle(vote)}</CardTitle>
      </CardHeader>

      {stage === "open" ? (
        <CardContent className="flex flex-wrap gap-x-10 gap-y-4 border-t pt-4">
          {startedAt ? (
            <Figure label="Open for" value={elapsedLabel((now - startedAt) / 1000)} />
          ) : null}
          {endTime && endTime > now ? (
            <Figure
              label="Closing in"
              value={elapsedLabel((endTime - now) / 1000)}
              tone="alert"
            />
          ) : null}
          <Figure label="Ballots" value={String(vote.totalVotes)} />
        </CardContent>
      ) : null}
    </Card>
  );
}
