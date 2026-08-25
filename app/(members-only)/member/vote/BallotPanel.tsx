"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  LockKeyhole,
  LockKeyholeOpen,
  MapPin,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ChoiceButton, VoteFlag, VoteNote } from "./pieces";
import { ProxyRequestDialog } from "./ProxyDialogs";
import {
  ABSTAIN,
  BIDDING_CHOICES,
  ROUND_CHOICES,
  ROUND_TITLE,
  canCastProxy,
  distanceMeters,
  hasSubmittedBallot,
  stageOf,
  type BallotLocation,
  type PledgeRound,
  type VoteDetail,
} from "./types";
import * as api from "./api";

type PledgeSelection = Partial<Record<PledgeRound, string>>;

/**
 * One vote, from the side of the person casting a ballot in it.
 *
 * The panel has one job and says so: what is being decided, where you are
 * voting from, and the answers. Everything to do with *running* the vote lives
 * in the officer's tab, even for the officer who can do both.
 */
export function BallotPanel({
  vote,
  onChanged,
}: {
  vote: VoteDetail;
  onChanged: () => Promise<void>;
}) {
  const stage = stageOf(vote);
  const submitted = hasSubmittedBallot(vote);
  const proxyBallot = stage === "locked";

  const [electionChoice, setElectionChoice] = React.useState<string | null>(null);
  const [pledgeSelections, setPledgeSelections] = React.useState<
    Record<string, PledgeSelection>
  >({});
  const [biddingSelections, setBiddingSelections] = React.useState<
    Record<string, string>
  >({});

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [locationPromptOpen, setLocationPromptOpen] = React.useState(false);
  const [showProxyRequest, setShowProxyRequest] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);

  const {
    permission,
    fix,
    asking,
    ask: askForLocation,
    skipped,
    skip: skipLocation,
  } = useBallotLocation(!submitted && (stage === "open" || canCastProxy(vote)));

  // Answers belong to the vote they were typed into. Switching votes in the
  // list must not carry a half-filled pledge ballot across to another one.
  React.useEffect(() => {
    setElectionChoice(null);
    setPledgeSelections({});
    setBiddingSelections({});
    setError(null);
  }, [vote._id, vote.round, vote.started, vote.ended]);

  const distance = React.useMemo(() => {
    if (!fix || !vote.votingLocation) return null;
    return distanceMeters(fix, vote.votingLocation);
  }, [fix, vote.votingLocation]);

  const outsideBoundary =
    !!vote.votingLocation && distance !== null && distance > vote.votingLocation.radiusMeters;

  const complete = React.useMemo(() => {
    switch (vote.type) {
      case "Election":
        return electionChoice !== null;
      case "Pledge":
        return (vote.pledges ?? [])
          .filter((p) => vote.votedPledges?.[p] !== true)
          .every((p) => pledgeSelections[p]?.board && pledgeSelections[p]?.blackball);
      case "Bidding":
        return (vote.rushees ?? [])
          .filter((r) => vote.votedRushees?.[r] !== true)
          .every((r) => !!biddingSelections[r]);
    }
  }, [vote, electionChoice, pledgeSelections, biddingSelections]);

  /** Says what is still missing, rather than leaving a dimmed button to explain itself. */
  const incompleteReason = React.useMemo(() => {
    if (complete) return null;
    switch (vote.type) {
      case "Election":
        return "Pick an option, or abstain.";
      case "Pledge": {
        const remaining = (vote.pledges ?? []).filter(
          (p) =>
            vote.votedPledges?.[p] !== true &&
            !(pledgeSelections[p]?.board && pledgeSelections[p]?.blackball)
        ).length;
        return remaining === 1
          ? "One pledge still needs both answers."
          : `${remaining} pledges still need both answers.`;
      }
      case "Bidding": {
        const remaining = (vote.rushees ?? []).filter(
          (r) => vote.votedRushees?.[r] !== true && !biddingSelections[r]
        ).length;
        return remaining === 1
          ? "One rushee still needs an answer."
          : `${remaining} rushees still need an answer.`;
      }
    }
  }, [complete, vote, pledgeSelections, biddingSelections]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Taken now, not when the panel opened. The whole value of the record is
      // that it says where somebody was when they voted.
      const location: BallotLocation | null =
        permission === "denied" ? null : await api.captureLocation();

      switch (vote.type) {
        case "Election":
          if (!electionChoice) return;
          await api.castElection(vote._id, electionChoice, proxyBallot, location);
          break;
        case "Pledge":
          await api.castPledge(
            vote._id,
            (vote.pledges ?? []).filter((p) => vote.votedPledges?.[p] !== true),
            pledgeSelections,
            proxyBallot,
            location
          );
          break;
        case "Bidding":
          await api.castBidding(
            vote._id,
            (vote.rushees ?? []).filter((r) => vote.votedRushees?.[r] !== true),
            biddingSelections,
            proxyBallot,
            location
          );
          break;
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your ballot could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function withdrawProxy() {
    setWithdrawing(true);
    setError(null);
    try {
      await api.withdrawProxy(vote._id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be withdrawn.");
    } finally {
      setWithdrawing(false);
      setWithdrawOpen(false);
    }
  }

  // What the member sees once their ballot is in. Deliberately final: there is
  // no unsend, and a panel that still showed the answers would imply there was.
  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14">
          <CheckCircle2
            className="size-10 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
          <p className="text-lg font-semibold">Your ballot is in</p>
          <p className="text-sm text-muted-foreground">
            It cannot be changed or withdrawn.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (stage === "closed") {
    return (
      <VoteNote icon={LockKeyhole}>
        This vote is closed. Results are read out by E-Council.
      </VoteNote>
    );
  }

  const showBallot = stage === "open" || canCastProxy(vote);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Couldn&apos;t send your ballot</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stage === "locked" ? (
        <ProxySection
          vote={vote}
          withdrawing={withdrawing}
          onAsk={() => setShowProxyRequest(true)}
          onWithdraw={() => setWithdrawOpen(true)}
        />
      ) : null}

      {/* Only ever shown when something is actually wrong. A card explaining
        * the location on every ballot was a paragraph between the member and
        * the thing they came to do, on every vote, forever. */}
      {showBallot && outsideBoundary ? (
        <VoteNote icon={TriangleAlert} tone="caution">
          <p className="font-medium text-foreground">
            You&apos;re outside the voting boundary
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Your ballot will be flagged for review. Let your Regent or Vice Regent know.
          </p>
        </VoteNote>
      ) : null}

      {showBallot && !fix && !skipped && permission !== "denied" ? (
        <LocationAsk asking={asking} onEnable={askForLocation} onSkip={skipLocation} />
      ) : null}

      {showBallot && permission === "denied" && !skipped ? (
        <VoteNote icon={MapPin}>
          <p className="font-medium text-foreground">Location is switched off</p>
          <p className="mt-0.5 text-muted-foreground">
            Your ballot still counts. Turning location back on in your browser settings
            helps tell proxy votes apart from in-person ones.
          </p>
        </VoteNote>
      ) : null}

      {showBallot ? (
        <>
          {vote.type === "Election" ? (
            <ElectionBallot
              options={vote.options ?? []}
              selection={electionChoice}
              onSelect={setElectionChoice}
              disabled={submitting}
            />
          ) : null}

          {vote.type === "Pledge" ? (
            <PledgeBallot
              pledges={vote.pledges ?? []}
              votedPledges={vote.votedPledges ?? {}}
              selections={pledgeSelections}
              onChange={setPledgeSelections}
              disabled={submitting}
            />
          ) : null}

          {vote.type === "Bidding" ? (
            <BiddingBallot
              rushees={vote.rushees ?? []}
              snapBids={vote.snapBids ?? []}
              votedRushees={vote.votedRushees ?? {}}
              selections={biddingSelections}
              onChange={setBiddingSelections}
              disabled={submitting}
            />
          ) : null}

          <Card>
            <CardFooter className="flex flex-col gap-2 py-4">
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!complete || submitting}
                onClick={() => {
                  // The permission was asked for once, possibly weeks ago and
                  // possibly by somebody tapping through. This is the one
                  // moment where it matters, so it is worth asking again — once,
                  // with an obvious way past it. Nothing here blocks the ballot.
                  if (!fix && permission !== "granted") setLocationPromptOpen(true);
                  else setConfirmOpen(true);
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : proxyBallot ? (
                  "Send proxy ballot"
                ) : (
                  "Send ballot"
                )}
              </Button>
              {incompleteReason ? (
                <p className="text-center text-xs text-muted-foreground">
                  {incompleteReason}
                </p>
              ) : null}
            </CardFooter>
          </Card>
        </>
      ) : null}

      <AlertDialog open={locationPromptOpen} onOpenChange={setLocationPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vote without your location?</AlertDialogTitle>
            <AlertDialogDescription>
              Your ballot counts either way, but it won&apos;t be possible to tell it
              from one cast away from chapter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLocationPromptOpen(false);
                setConfirmOpen(true);
              }}
            >
              Vote anyway
            </Button>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                await askForLocation();
                setLocationPromptOpen(false);
                setConfirmOpen(true);
              }}
            >
              Turn it on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send your ballot?</AlertDialogTitle>
            <AlertDialogDescription>
              Your ballot cannot be changed or withdrawn once it&apos;s sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw your proxy request?</AlertDialogTitle>
            <AlertDialogDescription>
              You can ask again while the vote is still closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void withdrawProxy()}>
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProxyRequestDialog
        voteId={vote._id}
        open={showProxyRequest}
        onOpenChange={setShowProxyRequest}
        onSent={onChanged}
      />
    </div>
  );
}

// MARK: - Proxy

function ProxySection({
  vote,
  withdrawing,
  onAsk,
  onWithdraw,
}: {
  vote: VoteDetail;
  withdrawing: boolean;
  onAsk: () => void;
  onWithdraw: () => void;
}) {
  switch (vote.proxyStatus) {
    case "approved":
      return (
        <VoteNote icon={LockKeyholeOpen} tone="positive">
          Proxy approved. Your ballot is unlocked early.
        </VoteNote>
      );

    case "pending":
      return (
        <div className="space-y-2">
          <VoteNote icon={Clock} tone="caution">
            Proxy requested. Waiting on E-Council.
          </VoteNote>
          <Button type="button" variant="outline" disabled={withdrawing} onClick={onWithdraw}>
            {withdrawing ? <Loader2 className="size-4 animate-spin" /> : null}
            Withdraw request
          </Button>
        </div>
      );

    case "denied":
      return (
        <div className="space-y-2">
          <VoteNote icon={X} tone="negative">
            {vote.proxyDecisionNote?.trim()
              ? `Proxy denied. ${vote.proxyDecisionNote.trim()}`
              : "Proxy denied."}
          </VoteNote>
          <Button type="button" variant="outline" onClick={onAsk}>
            Ask again
          </Button>
        </div>
      );

    default:
      return (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Can&apos;t be at chapter?</CardTitle>
              <CardDescription>
                Ask E-Council to unlock your ballot before the vote opens.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={onAsk}>
              Request a proxy vote
            </Button>
          </CardHeader>
        </Card>
      );
  }
}

// MARK: - Location

function LocationAsk({
  asking,
  onEnable,
  onSkip,
}: {
  asking: boolean;
  onEnable: () => Promise<void>;
  onSkip: () => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Turn on location</CardTitle>
          <CardDescription>
            It helps tell proxy votes apart from in-person ones. Your ballot counts
            either way.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Not now
          </Button>
          <Button type="button" disabled={asking} onClick={() => void onEnable()}>
            {asking ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            Turn on location
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * The browser's standing on location, and a fix once there is one.
 *
 * Never asks on its own. Arriving on a screen is not consent, and browsers
 * only raise the native prompt from a gesture anyway — so the ask belongs to
 * the button that explains it.
 */
function useBallotLocation(active: boolean) {
  const [permission, setPermission] = React.useState<PermissionState>("unknown");
  const [fix, setFix] = React.useState<BallotLocation | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [skipped, setSkipped] = React.useState(false);

  React.useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.permissions) return;
    let cancelled = false;

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state as PermissionState);
        status.onchange = () => setPermission(status.state as PermissionState);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [active]);

  // Already granted: take one fix so the boundary check has something to
  // measure and Submit isn't waiting on cold hardware.
  React.useEffect(() => {
    if (!active || permission !== "granted" || fix) return;
    let cancelled = false;
    api.captureLocation().then((position) => {
      if (!cancelled) setFix(position);
    });
    return () => {
      cancelled = true;
    };
  }, [active, permission, fix]);

  const ask = React.useCallback(async () => {
    setAsking(true);
    try {
      const position = await api.captureLocation();
      setFix(position);
      setPermission(position ? "granted" : "denied");
    } finally {
      setAsking(false);
    }
  }, []);

  return {
    permission,
    fix,
    asking,
    ask,
    skipped,
    skip: () => setSkipped(true),
  };
}

// MARK: - Ballots

function ElectionBallot({
  options,
  selection,
  onSelect,
  disabled,
}: {
  options: string[];
  selection: string | null;
  onSelect: (next: string | null) => void;
  disabled: boolean;
}) {
  // Abstaining is an answer the chapter counts, so it sits with the others
  // rather than hiding behind a "skip" link.
  const choices = [...options, ABSTAIN];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Your choice</CardTitle>
        <CardDescription>Pick one. Tap it again to clear it.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {choices.map((option, index) => {
          const isSelected = selection === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : option)}
              className={cn(
                "flex w-full items-center gap-3 px-6 py-4 text-left transition-colors",
                index > 0 && "border-t",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
                isSelected && "bg-accent"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  isSelected ? "border-primary" : "border-muted-foreground/50"
                )}
                aria-hidden="true"
              >
                {isSelected ? <span className="size-2.5 rounded-full bg-primary" /> : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1",
                  isSelected ? "font-semibold" : "font-normal",
                  option === ABSTAIN && "text-muted-foreground"
                )}
              >
                {option}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Every pledge is answered twice: once on boarding, once on blackballing.
 *
 * Both halves are on screen together rather than in two passes — splitting
 * them would mean answering a name, scrolling away, and meeting the same name
 * again with a different question attached to it.
 */
function PledgeBallot({
  pledges,
  votedPledges,
  selections,
  onChange,
  disabled,
}: {
  pledges: string[];
  votedPledges: Record<string, boolean>;
  selections: Record<string, PledgeSelection>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, PledgeSelection>>>;
  disabled: boolean;
}) {
  function set(pledge: string, round: PledgeRound, value: string | null) {
    onChange((current) => ({
      ...current,
      [pledge]: { ...current[pledge], [round]: value ?? undefined },
    }));
  }

  return (
    <div className="space-y-4">
      {pledges.map((pledge) => {
        if (votedPledges[pledge]) return <SettledCard key={pledge} name={pledge} />;
        const selection = selections[pledge] ?? {};
        const done = !!selection.board && !!selection.blackball;

        return (
          <Card
            key={pledge}
            className={cn(done && "border-emerald-700/40 dark:border-emerald-400/40")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{pledge}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["board", "blackball"] as PledgeRound[]).map((round) => (
                <fieldset key={round} className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {ROUND_TITLE[round]}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {ROUND_CHOICES[round].map((choice) => (
                      <ChoiceButton
                        key={choice}
                        choice={choice}
                        selected={selection[round] === choice}
                        disabled={disabled}
                        onSelect={(next) => set(pledge, round, next)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function BiddingBallot({
  rushees,
  snapBids,
  votedRushees,
  selections,
  onChange,
  disabled,
}: {
  rushees: string[];
  snapBids: string[];
  votedRushees: Record<string, boolean>;
  selections: Record<string, string>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      {snapBids.length ? (
        <VoteNote icon={Zap} tone="caution">
          {snapBids.length === 1
            ? `${snapBids[0]} has been snap bidded by the Regent.`
            : `${snapBids.length} rushees have been snap bidded by the Regent.`}
        </VoteNote>
      ) : null}

      {rushees.map((rushee) => {
        if (votedRushees[rushee]) return <SettledCard key={rushee} name={rushee} />;
        const selection = selections[rushee];

        return (
          <Card
            key={rushee}
            className={cn(selection && "border-emerald-700/40 dark:border-emerald-400/40")}
          >
            <CardHeader className="flex-row items-center gap-2 pb-3">
              <CardTitle className="text-base">{rushee}</CardTitle>
              {snapBids.includes(rushee) ? (
                <VoteFlag icon={Zap} tone="caution">
                  Snap bid
                </VoteFlag>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {BIDDING_CHOICES.map((choice) => (
                  <ChoiceButton
                    key={choice}
                    choice={choice}
                    selected={selection === choice}
                    disabled={disabled}
                    onSelect={(next) =>
                      onChange((current) => {
                        const copy = { ...current };
                        if (next) copy[rushee] = next;
                        else delete copy[rushee];
                        return copy;
                      })
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** A name this member already answered on an earlier submission. */
function SettledCard({ name }: { name: string }) {
  return (
    <Card className="bg-muted/40">
      <CardContent className="flex items-center gap-3 py-4">
        <CheckCircle2
          className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
          {name}
        </span>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Answered</span>
      </CardContent>
    </Card>
  );
}
