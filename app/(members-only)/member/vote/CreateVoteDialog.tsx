"use client";

import * as React from "react";
import {
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import * as api from "./api";
import { KIND_ICON } from "./pieces";
import {
  KIND_BLURB,
  KIND_HEADING,
  KIND_SUBJECT,
  KIND_TITLE,
  type VoteKind,
} from "./types";

/**
 * Making a vote.
 *
 * Two steps, because it is one self-contained task: pick what kind of vote
 * this is, then name what is on the ballot. Kind first and irreversibly,
 * because it decides what the second step is even asking for.
 *
 * The vote is created locked. Opening it is a separate, deliberate act, which
 * is also what gives members a window to ask for a proxy.
 */
export function CreateVoteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (voteId: string) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<VoteKind | null>(null);
  const [title, setTitle] = React.useState("");
  const [names, setNames] = React.useState<string[]>([""]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setKind(null);
    setTitle("");
    setNames([""]);
    setError(null);
  }, [open]);

  const filled = names.map((n) => n.trim()).filter(Boolean);

  async function save() {
    if (!kind) return;
    setSaving(true);
    setError(null);
    try {
      // Anchored to wherever the officer is sitting, without asking. A vote is
      // made at chapter, for chapter, so the answer is rarely in doubt and it
      // can still be moved afterwards. Best-effort: a vote that failed to be
      // created because a position fix didn't arrive would be an absurd thing
      // to explain in a meeting.
      const fix = await api.captureLocation();
      const voteId = await api.createVote(
        kind,
        kind === "Election" ? title : null,
        filled,
        fix ? { lat: fix.lat, lng: fix.lng, label: null, radiusMeters: 200 } : null
      );
      await onCreated(voteId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The vote could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {kind ? `New ${KIND_TITLE[kind].toLowerCase()}` : "New vote"}
          </DialogTitle>
          <DialogDescription>
            {kind
              ? "The vote is created closed. Open it when the chapter is ready."
              : "What is the chapter deciding?"}
          </DialogDescription>
        </DialogHeader>

        {!kind ? (
          <div className="space-y-2">
            {(["Election", "Pledge", "Bidding"] as VoteKind[]).map((option) => {
              const Icon = KIND_ICON[option];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="rounded-lg bg-muted p-2.5 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{KIND_TITLE[option]}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {KIND_BLURB[option]}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-5">
            {kind === "Election" ? (
              <div className="space-y-2">
                <Label htmlFor="vote-title">Title</Label>
                <Input
                  id="vote-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Treasurer, Spring 2027"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Without one the vote is listed simply as an election.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>{KIND_HEADING[kind]}</Label>
              <div className="space-y-2">
                {names.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={name}
                      onChange={(event) =>
                        setNames((current) =>
                          current.map((n, i) => (i === index ? event.target.value : n))
                        )
                      }
                      onKeyDown={(event) => {
                        // Return moves to the next field, or opens one when
                        // this is the last: filling in five names shouldn't
                        // mean reaching for a button between each.
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (index === names.length - 1 && name.trim()) {
                          setNames((current) => [...current, ""]);
                        }
                      }}
                      placeholder={`${KIND_SUBJECT[kind]
                        .charAt(0)
                        .toUpperCase()}${KIND_SUBJECT[kind].slice(1)} ${index + 1}`}
                      aria-label={`${KIND_SUBJECT[kind]} ${index + 1}`}
                    />
                    {/* Only offered when there is more than one row: a list
                      * needs at least one name, and a delete button that
                      * refuses to delete is worse than no button. */}
                    {names.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${name.trim() || `${KIND_SUBJECT[kind]} ${index + 1}`}`}
                        onClick={() =>
                          setNames((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Minus className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setNames((current) => [...current, ""])}
              >
                <Plus className="size-4" />
                Add another {KIND_SUBJECT[kind]}
              </Button>
            </div>

            {error ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>Couldn&apos;t create the vote</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => (kind ? setKind(null) : onOpenChange(false))}
          >
            {kind ? "Back" : "Cancel"}
          </Button>
          {kind ? (
            <Button type="button" disabled={!filled.length || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Create vote
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
