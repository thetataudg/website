"use client";

import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Gavel,
  Loader2,
  MapPin,
  MapPinOff,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import * as api from "./api";
import { MeetingLocationDialog } from "./MeetingLocationDialog";
import { ProxyQueueDialog } from "./ProxyDialogs";
import { VoteFlag, VoteNote } from "./pieces";
import {
  KIND_HEADING,
  metresLabel,
  stageOf,
  type VoteDetail,
  type VoteSummary,
} from "./types";

/**
 * One vote, from the side of the officer running it.
 *
 * Built around the one thing the vote is waiting for. A locked vote is waiting
 * to be opened, and before that it is waiting on proxy decisions, so those are
 * what the panel leads with; a closed vote is waiting on the roll. Everything
 * else is reference material and sits below in plain rows.
 */
export function ControlPanel({
  vote,
  summary,
  canSnapBid,
  isNewestVote,
  onChanged,
  onDeleted,
  onReview,
}: {
  vote: VoteDetail;
  summary: VoteSummary | undefined;
  canSnapBid: boolean;
  isNewestVote: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onReview: () => void;
}) {
  const stage = stageOf(vote);

  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [endOpen, setEndOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [locationOpen, setLocationOpen] = React.useState(false);
  const [proxyOpen, setProxyOpen] = React.useState(false);
  const [pendingProxies, setPendingProxies] = React.useState(0);
  const [openWithPendingOpen, setOpenWithPendingOpen] = React.useState(false);

  // Only worth asking for while it can still be acted on. Quiet on failure: an
  // officer who isn't allowed to decide proxies gets a 403 here, and that must
  // not blank the controls they *can* use.
  React.useEffect(() => {
    if (stage !== "locked") {
      setPendingProxies(0);
      return;
    }
    let active = true;
    api
      .proxyQueue(vote._id)
      .then((queue) => {
        if (!active) return;
        setPendingProxies(queue.requests.filter((r) => r.status === "pending").length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [vote._id, stage]);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setWorking(false);
    }
  }

  const anchor = vote.votingLocation;

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>That didn&apos;t work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* The one thing this vote is waiting for, first and largest. */}
      {stage !== "closed" ? (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">
                {stage === "locked" ? "Ready to open" : "Voting is open"}
              </CardTitle>
              <CardDescription>
                {stage === "locked"
                  ? "Members can ask for a proxy until you open it."
                  : "Ending gives anybody mid-ballot a chance to send it."}
              </CardDescription>
            </div>
            {stage === "locked" ? (
              <Button
                type="button"
                size="lg"
                disabled={working}
                onClick={() => {
                  // Opening the vote is what closes proxy decisions for good,
                  // so an officer about to do it with requests outstanding is
                  // told once.
                  if (pendingProxies > 0) setOpenWithPendingOpen(true);
                  else void run(() => api.startVote(vote._id));
                }}
              >
                {working ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Open voting
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                variant="destructive"
                disabled={working}
                onClick={() => setEndOpen(true)}
              >
                {working ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                End voting
              </Button>
            )}
          </CardHeader>
        </Card>
      ) : null}

      {stage === "closed" ? (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">After the vote</CardTitle>
              <CardDescription>
                {vote.voterListVerified
                  ? "The roll is verified and the results are unsealed."
                  : "Verify the roll to unseal the results."}
              </CardDescription>
            </div>
            <Button type="button" onClick={onReview}>
              {vote.voterListVerified ? "Open the roll" : "Verify the roll"}
              <ChevronRight className="size-4" />
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {/* Setup */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Setup</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SettingRow
            icon={anchor ? MapPin : MapPinOff}
            title="Meeting location"
            detail={
              anchor
                ? `${anchor.label?.trim() || "Set"} · within ${metresLabel(anchor.radiusMeters)}`
                : "Not set"
            }
            muted={!anchor}
            disabled={stage === "closed"}
            onClick={() => setLocationOpen(true)}
          />
          {stage === "locked" ? (
            <SettingRow
              icon={UserRoundCheck}
              title="Proxy requests"
              detail={
                pendingProxies === 0
                  ? "Nothing waiting on you"
                  : pendingProxies === 1
                  ? "1 waiting on you"
                  : `${pendingProxies} waiting on you`
              }
              badge={pendingProxies}
              onClick={() => setProxyOpen(true)}
            />
          ) : null}
          {vote.type === "Pledge" ? (
            <PledgeConsRow vote={vote} enabled={isNewestVote} />
          ) : null}
        </CardContent>
      </Card>

      {/* The names on the ballot. Numbered, because a ballot is an ordered list
        * and reading one back to a room is easier when the rows count. */}
      <SubjectsCard
        vote={vote}
        canSnapBid={canSnapBid}
        onChanged={onChanged}
        onError={setError}
      />

      {/* Out of the way, and deliberately last. */}
      {stage !== "open" ? (
        <Card className="border-destructive/40">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Finish with this vote</CardTitle>
              <CardDescription>
                Archiving keeps it readable. Deleting does not.
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              {stage === "closed" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={working}
                  onClick={() =>
                    void run(() => api.setArchived(vote._id, !summary?.archived))
                  }
                >
                  {summary?.archived ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  {summary?.archived ? "Unarchive" : "Archive"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                disabled={working}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete vote
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End voting?</AlertDialogTitle>
            <AlertDialogDescription>
              A countdown gives anybody mid-ballot a chance to send it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEndOpen(false);
                void run(() => api.endVote(vote._id, 30));
              }}
            >
              Give them 30 seconds
            </Button>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setEndOpen(false);
                void run(() => api.endVote(vote._id, 0));
              }}
            >
              End now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openWithPendingOpen} onOpenChange={setOpenWithPendingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Requests still waiting</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingProxies === 1
                ? "One proxy request has not been decided. Opening the vote denies it."
                : `${pendingProxies} proxy requests have not been decided. Opening the vote denies them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpenWithPendingOpen(false);
                setProxyOpen(true);
              }}
            >
              Review them
            </Button>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setOpenWithPendingOpen(false);
                void run(() => api.startVote(vote._id));
              }}
            >
              Open anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vote?</AlertDialogTitle>
            <AlertDialogDescription>
              The vote and every ballot in it are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                setDeleteOpen(false);
                setWorking(true);
                try {
                  await api.deleteVote(vote._id);
                  await onDeleted();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That didn't work.");
                } finally {
                  setWorking(false);
                }
              }}
            >
              Delete vote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MeetingLocationDialog
        voteId={vote._id}
        existing={anchor}
        open={locationOpen}
        onOpenChange={setLocationOpen}
        onSaved={onChanged}
      />

      <ProxyQueueDialog
        voteId={vote._id}
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        onChanged={onChanged}
      />
    </div>
  );
}

/** A row that names a setting and reports where it stands. */
function SettingRow({
  icon: Icon,
  title,
  detail,
  muted,
  disabled,
  badge = 0,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
  muted?: boolean;
  disabled?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-4 border-b px-6 py-4 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
    >
      <Icon
        className={cn("size-5 shrink-0", muted ? "text-muted-foreground" : "text-primary")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
      {badge > 0 ? (
        <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-destructive-foreground">
          {badge}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/**
 * The names on the ballot, plus the two things an officer can still change
 * about them: an election's options before it opens, and a bidding vote's snap
 * bids, which only the Regent may set.
 */
function SubjectsCard({
  vote,
  canSnapBid,
  onChanged,
  onError,
}: {
  vote: VoteDetail;
  canSnapBid: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const stage = stageOf(vote);
  const [editing, setEditing] = React.useState(false);
  const [newOption, setNewOption] = React.useState("");
  const [working, setWorking] = React.useState<string | null>(null);

  const names =
    vote.type === "Election"
      ? vote.options ?? []
      : vote.type === "Pledge"
      ? vote.pledges ?? []
      : vote.rushees ?? [];

  async function run(key: string, action: () => Promise<void>) {
    setWorking(key);
    try {
      await action();
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">{KIND_HEADING[vote.type]}</CardTitle>
        {vote.type === "Election" && stage === "locked" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil className="size-4" />
            {editing ? "Done" : "Edit options"}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {names.map((name, index) => (
          <div
            key={name}
            className={cn("flex items-center gap-3 px-6 py-3", index > 0 && "border-t")}
          >
            <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm">{name}</span>

            {vote.type === "Bidding" && vote.snapBids?.includes(name) ? (
              <VoteFlag icon={Zap} tone="caution">
                Snap bid
              </VoteFlag>
            ) : null}

            {vote.type === "Bidding" && canSnapBid && stage !== "closed" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={working === name}
                onClick={() => void run(name, () => api.toggleSnapBid(vote._id, name))}
              >
                {working === name ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                {vote.snapBids?.includes(name) ? "Undo snap bid" : "Snap bid"}
              </Button>
            ) : null}

            {vote.type === "Election" && editing ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${name}`}
                disabled={working === name}
                onClick={() => void run(name, () => api.removeOption(vote._id, name))}
              >
                {working === name ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4 text-destructive" />
                )}
              </Button>
            ) : null}
          </div>
        ))}

        {vote.type === "Election" && editing ? (
          <div className="flex gap-2 border-t px-6 py-4">
            <Input
              value={newOption}
              onChange={(event) => setNewOption(event.target.value)}
              placeholder="Add an option"
              aria-label="New option"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !newOption.trim()) return;
                event.preventDefault();
                const option = newOption.trim();
                setNewOption("");
                void run("add", () => api.addOption(vote._id, option));
              }}
            />
            <Button
              type="button"
              disabled={!newOption.trim() || working === "add"}
              onClick={() => {
                const option = newOption.trim();
                setNewOption("");
                void run("add", () => api.addOption(vote._id, option));
              }}
            >
              {working === "add" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Which pledges have a valid con recorded against them.
 *
 * A boarding or blackballing without one cannot stand under the bylaws, and
 * the results route reads exactly this to say so. The API it talks to only
 * ever addresses the newest vote, so the row says as much rather than silently
 * editing the wrong ballot.
 */
function PledgeConsRow({ vote, enabled }: { vote: VoteDetail; enabled: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [cons, setCons] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !enabled) return;
    setLoading(true);
    api
      .pledgeCons()
      .then((data) => setCons(data.pledgeValidCons ?? {}))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, enabled]);

  const recorded = Object.values(cons).filter(Boolean).length;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        disabled={!enabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
      >
        <Gavel className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Valid cons</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {enabled
              ? open
                ? `${recorded} recorded`
                : "Which pledges had a con read against them"
              : "Only the newest pledge vote can be edited"}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>

      {open && enabled ? (
        <div className="space-y-3 border-t bg-muted/30 px-6 py-4">
          {error ? (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {(vote.pledges ?? []).map((pledge) => (
                <div key={pledge} className="flex items-center gap-3">
                  <Checkbox
                    id={`con-${pledge}`}
                    checked={!!cons[pledge]}
                    onCheckedChange={(checked) =>
                      setCons((current) => ({ ...current, [pledge]: checked === true }))
                    }
                  />
                  <Label htmlFor={`con-${pledge}`} className="text-sm font-normal">
                    {pledge}
                  </Label>
                </div>
              ))}

              <VoteNote>
                A boarding or blackballing without a con recorded here cannot stand.
              </VoteNote>

              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    await api.savePledgeCons(cons);
                    setOpen(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "That didn't work.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save cons
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
