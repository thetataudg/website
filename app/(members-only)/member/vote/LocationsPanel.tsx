"use client";

import * as React from "react";
import { MapPinOff, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import * as api from "./api";
import { StatRow } from "./pieces";
import { BallotMap, MapLegend } from "./VoteMap";
import { metresLabel, type VoteIntegrity } from "./types";

/**
 * Where a vote's ballots came from.
 *
 * This is the panel the whole location feature exists for, and it is also the
 * one that has to be most careful. It shows every ballot as a point and says
 * nothing at all about who cast any of them: the records behind it live in
 * their own collection with no member reference, no time-ordered identifier,
 * and they are read back shuffled. There is no ordering here to line up
 * against the roll, and no way to ask this panel about a person.
 *
 * What it can answer is the question it was built for: did the ballots come
 * from the room, and is anything cast from elsewhere accounted for by a proxy?
 */
export function LocationsPanel({ voteId }: { voteId: string }) {
  const [data, setData] = React.useState<VoteIntegrity | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [flaggedOnly, setFlaggedOnly] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .voteIntegrity(voteId)
      .then((fresh) => {
        if (!active) return;
        setData(fresh);
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

  if (loading && !data) {
    return <Skeleton className="h-80 w-full rounded-lg" />;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="size-4" />
        <AlertTitle>Ballot locations</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const unlocated = Math.max(0, data.ballotCount - data.locatedCount);
  const points = flaggedOnly ? data.points.filter((p) => p.flagged) : data.points;
  const flagged = data.points.filter((p) => p.flagged);

  if (!data.locatedCount) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <MapPinOff className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-semibold">No ballot reported a location</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {data.ballotCount === 0
              ? "No ballots were cast in this vote."
              : `All ${data.ballotCount} ballots were cast without location permission.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Where ballots were cast from</CardTitle>
            <CardDescription>
              Positions only. Nothing here is attached to a member.
            </CardDescription>
          </div>
          {flagged.length ? (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(event) => setFlaggedOnly(event.target.checked)}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              Flagged only
            </label>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          <BallotMap anchor={data.anchor} points={points} />
          <MapLegend />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Coverage</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          <StatRow label="Ballots counted" value={String(data.ballotCount)} />
          <StatRow label="With a location" value={String(data.locatedCount)} />
          <StatRow
            label="Cast at the meeting"
            value={data.anchor ? String(data.atAnchorCount) : "No anchor set"}
            tone={data.anchor ? "positive" : "muted"}
          />
          <StatRow label="Marked as proxy" value={String(data.proxyCount)} />
          <StatRow
            label="Flagged"
            value={String(data.flaggedCount)}
            tone={data.flaggedCount > 0 ? "negative" : "muted"}
          />
        </CardContent>
        {unlocated > 0 ? (
          <CardContent className="border-t pt-4 text-xs text-muted-foreground">
            {unlocated} ballots reported no position. Declining the permission does not
            stop anyone voting, so the map is never the whole tally.
          </CardContent>
        ) : null}
      </Card>

      {flagged.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Flagged ballots</CardTitle>
            <CardDescription>A flag is a question, not a finding.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {flagged.map((point, index) => (
              <div
                key={`${point.lat},${point.lng},${index}`}
                className={cn("flex items-start gap-3 px-6 py-3", index > 0 && "border-t")}
              >
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {point.distanceMeters != null
                      ? `${metresLabel(point.distanceMeters)} away`
                      : "Distance unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cast away from the meeting and not marked as a proxy.
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.clusters.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Where ballots grouped</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.clusters.slice(0, 6).map((cluster, index) => (
              <div
                key={`${cluster.lat},${cluster.lng},${cluster.count}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-6 py-3",
                  index > 0 && "border-t"
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {index === 0 ? "Largest group" : `Group ${index + 1}`}
                  </p>
                  {cluster.proxyCount > 0 || cluster.flaggedCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {[
                        cluster.proxyCount > 0 ? `${cluster.proxyCount} proxy` : null,
                        cluster.flaggedCount > 0 ? `${cluster.flaggedCount} flagged` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {cluster.count === 1 ? "1 ballot" : `${cluster.count} ballots`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
