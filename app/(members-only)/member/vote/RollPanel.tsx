"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  LockKeyholeOpen,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import * as api from "./api";
import { VoteNote } from "./pieces";
import type { VoterListResponse, VoterRecord } from "./types";

/**
 * Who voted, who did not, and whose ballot should not stand.
 *
 * Note what the roll is *not*. It knows that a member voted; it does not know
 * what they voted for. Those are separate records on the server, and striking
 * a ballot removes it from the tally without anybody ever seeing its contents.
 *
 * Verifying is one-way. The server refuses every further change afterwards,
 * which is the entire point of it, so the confirmation says so plainly.
 */

const FILTERS = [
  { id: "all", label: "Everyone" },
  { id: "voted", label: "Voted" },
  { id: "proxy", label: "Proxy" },
  { id: "missing", label: "No ballot" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function RollPanel({
  voteId,
  onChanged,
  onVerified,
}: {
  voteId: string;
  onChanged: () => Promise<void>;
  onVerified: () => void;
}) {
  const [data, setData] = React.useState<VoterListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [working, setWorking] = React.useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.voterList(voteId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The roll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [voteId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const voters = React.useMemo(() => data?.voterList ?? [], [data]);
  const verified = data?.voterListVerified ?? false;

  const counts: Record<FilterId, number> = {
    all: voters.length,
    voted: voters.filter((v) => v.status === "voted").length,
    proxy: voters.filter((v) => v.status === "proxy").length,
    missing: voters.filter((v) => v.status === "no-ballot").length,
  };

  const rows = React.useMemo(() => {
    let list = voters;
    if (filter === "voted") list = list.filter((v) => v.status === "voted");
    if (filter === "proxy") list = list.filter((v) => v.status === "proxy");
    if (filter === "missing") list = list.filter((v) => v.status === "no-ballot");

    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(needle) || v.rollNo.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [voters, filter, query]);

  /**
   * Strikes a ballot, or puts it back. Both directions, because an officer who
   * clicks the wrong row before verifying needs a way out that isn't re-running
   * the vote.
   */
  async function toggle(voter: VoterRecord) {
    setWorking(voter.clerkId);
    setError(null);
    try {
      if (voter.isInvalidated) await api.restoreBallot(voteId, voter.clerkId);
      else await api.invalidateBallot(voteId, voter.clerkId);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That ballot could not be changed.");
    } finally {
      setWorking(null);
    }
  }

  async function verify() {
    setVerifying(true);
    setError(null);
    try {
      await api.verifyVoterList(voteId);
      await load();
      await onChanged();
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The roll could not be verified.");
    } finally {
      setVerifying(false);
      setVerifyOpen(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Roll</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {verified ? (
        <VoteNote icon={ShieldCheck} tone="positive">
          The roll is verified. Ballots can no longer be struck or restored.
        </VoteNote>
      ) : null}

      <Card>
        <CardHeader className="gap-4 border-b">
          <div className="space-y-1.5">
            <CardTitle>Roll and ballots</CardTitle>
            <CardDescription>
              Whether a member&apos;s ballot is in, never what it said.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={filter === option.id ? "default" : "outline"}
                  onClick={() => setFilter(option.id)}
                >
                  {option.label}
                  <span className="font-mono text-xs tabular-nums opacity-75">
                    {counts[option.id]}
                  </span>
                </Button>
              ))}
            </div>

            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 sm:w-64">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or roll number"
                aria-label="Search the roll"
                className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!rows.length ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              {query ? `No match for “${query}”.` : "Nobody in this group."}
            </p>
          ) : (
            rows.map((voter, index) => (
              <VoterRow
                key={voter.clerkId}
                voter={voter}
                first={index === 0}
                canEdit={!verified}
                working={working === voter.clerkId}
                onToggle={() => void toggle(voter)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {!verified ? (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Verify the roll</CardTitle>
              <CardDescription>Results stay sealed until this is done.</CardDescription>
            </div>
            <Button type="button" onClick={() => setVerifyOpen(true)}>
              <ShieldCheck className="size-4" />
              Verify the roll
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      <AlertDialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verify the roll?</AlertDialogTitle>
            <AlertDialogDescription>
              This unseals the results. No ballot can be struck or restored afterwards,
              and the roll cannot be verified twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void verify();
              }}
            >
              {verifying ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VoterRow({
  voter,
  first,
  canEdit,
  working,
  onToggle,
}: {
  voter: VoterRecord;
  first: boolean;
  canEdit: boolean;
  working: boolean;
  onToggle: () => void;
}) {
  const Icon = voter.isInvalidated
    ? X
    : voter.status === "voted"
    ? CheckCircle2
    : voter.status === "proxy"
    ? LockKeyholeOpen
    : Circle;

  const tint = voter.isInvalidated
    ? "text-destructive"
    : voter.status === "voted"
    ? "text-emerald-700 dark:text-emerald-400"
    : voter.status === "proxy"
    ? "text-primary"
    : "text-muted-foreground";

  // A struck ballot comes back from the server as `no-ballot` — that is what
  // striking it means — so testing the status alone would hide the undo button
  // on precisely the rows that need it.
  const actionable = voter.status !== "no-ballot" || voter.isInvalidated;

  return (
    <div className={cn("flex items-center gap-3 px-6 py-3", !first && "border-t")}>
      <Icon className={cn("size-4 shrink-0", tint)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{voter.name}</p>
        <p
          className={cn(
            "text-xs",
            voter.isInvalidated ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {voter.isInvalidated
            ? "Ballot struck"
            : voter.status === "voted"
            ? "Voted"
            : voter.status === "proxy"
            ? "Proxy ballot"
            : "No ballot"}
        </p>
      </div>
      {voter.rollNo ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          #{voter.rollNo}
        </span>
      ) : null}
      {canEdit && actionable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={working}
          onClick={onToggle}
          aria-label={
            voter.isInvalidated
              ? `Restore ${voter.name}'s ballot`
              : `Strike ${voter.name}'s ballot`
          }
        >
          {working ? (
            <Loader2 className="size-4 animate-spin" />
          ) : voter.isInvalidated ? (
            <RotateCcw className="size-4 text-primary" />
          ) : (
            <X className="size-4 text-destructive" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
