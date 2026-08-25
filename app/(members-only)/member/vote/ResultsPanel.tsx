"use client";

import * as React from "react";
import { Award, Lock, TriangleAlert, Zap } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import * as api from "./api";
import { TallyBar, VoteFlag, VoteNote } from "./pieces";
import {
  ROUND_OBJECTION,
  ROUND_TITLE,
  choiceTone,
  displayTitle,
  type PledgeRound,
  type VoteResults,
} from "./types";

/**
 * The tally, once the roll has been verified.
 *
 * Struck ballots are already gone by the time this arrives — the server does
 * the filtering, so nothing here has to remember to. Abstentions are counted
 * in the turnout and in nobody's column, which is what abstaining means.
 */
export function ResultsPanel({
  voteId,
  sealed,
}: {
  voteId: string;
  sealed: boolean;
}) {
  const [results, setResults] = React.useState<VoteResults | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .voteResults(voteId)
      .then((fresh) => {
        if (!active) return;
        setResults(fresh);
        setError(null);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voteId]);

  if (sealed) {
    return (
      <VoteNote icon={Lock} tone="caution">
        Results stay sealed until the roll has been verified.
      </VoteNote>
    );
  }

  if (loading && !results) return <Skeleton className="h-64 w-full rounded-lg" />;

  if (error && !results) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="size-4" />
        <AlertTitle>Results</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!results) return null;

  const total = Math.max(results.totalVotes, 1);

  // The option with the most votes, and nothing on a tie — a tie is a decision
  // for the chapter, not something a results panel should announce.
  const ranked = Object.entries(results.results ?? {}).sort((a, b) => b[1] - a[1]);
  const leader =
    ranked.length && ranked[0][1] > 0 && !(ranked[1] && ranked[1][1] === ranked[0][1])
      ? ranked[0]
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{displayTitle(results)}</CardTitle>
          <CardDescription>
            {results.totalVotes} {results.totalVotes === 1 ? "ballot" : "ballots"} counted
          </CardDescription>
          {leader ? (
            <p className="flex items-center gap-2 pt-2 text-sm font-medium">
              <Award className="size-4 text-primary" aria-hidden="true" />
              {leader[0]} leads with {leader[1]}
            </p>
          ) : null}
        </CardHeader>
      </Card>

      {results.type === "Election" ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Tally</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {(results.options ?? []).map((option) => (
              <TallyBar
                key={option}
                label={option}
                count={results.results?.[option] ?? 0}
                total={total}
                tone={leader?.[0] === option ? "positive" : "muted"}
                emphasis={leader?.[0] === option}
              />
            ))}
            {(results.removedOptions ?? []).map((option) => (
              <TallyBar
                key={option}
                label={option}
                count={0}
                total={total}
                caption="Withdrawn after proxy ballots were cast. Votes for it are not counted."
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {results.type === "Pledge"
        ? (results.pledges ?? []).map((pledge) => (
            <Card key={pledge}>
              <CardHeader className="border-b">
                <CardTitle className="text-base">{pledge}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                {(["board", "blackball"] as PledgeRound[]).map((round) => {
                  const tally =
                    round === "board"
                      ? results.boardResults?.[pledge]
                      : results.blackballResults?.[pledge];
                  const against =
                    round === "board" ? tally?.board ?? 0 : tally?.blackball ?? 0;
                  const invalid =
                    round === "board" ? tally?.invalidBoard : tally?.invalidBlackball;

                  return (
                    <div key={round} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {ROUND_TITLE[round]}
                        </p>
                        {invalid ? (
                          <VoteFlag icon={TriangleAlert} tone="caution">
                            No valid con
                          </VoteFlag>
                        ) : null}
                      </div>
                      <TallyBar
                        label="Continue"
                        count={tally?.continue ?? 0}
                        total={total}
                        tone="positive"
                      />
                      <TallyBar
                        label={ROUND_OBJECTION[round]}
                        count={against}
                        total={total}
                        tone={choiceTone(ROUND_OBJECTION[round])}
                        caption={
                          invalid
                            ? "Cannot stand: no valid con was recorded against this pledge."
                            : null
                        }
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        : null}

      {results.type === "Bidding"
        ? (results.rushees ?? []).map((rushee) => {
            const tally = results.biddingResults?.[rushee];
            return (
              <Card key={rushee}>
                <CardHeader className="flex-row items-center gap-2 border-b">
                  <CardTitle className="text-base">{rushee}</CardTitle>
                  {results.snapBids?.includes(rushee) ? (
                    <VoteFlag icon={Zap} tone="caution">
                      Snap bid
                    </VoteFlag>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 pt-6">
                  <TallyBar
                    label="Bid"
                    count={tally?.bid ?? 0}
                    total={total}
                    tone="positive"
                  />
                  <TallyBar
                    label="No bid"
                    count={tally?.noBid ?? 0}
                    total={total}
                    tone="negative"
                  />
                </CardContent>
              </Card>
            );
          })
        : null}
    </div>
  );
}
