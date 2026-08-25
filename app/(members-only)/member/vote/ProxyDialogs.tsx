"use client";

import * as React from "react";
import { Check, Clock, Loader2, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

import * as api from "./api";
import type { ProxyQueue, ProxyRequest } from "./types";

/**
 * Asking to vote before the room does.
 *
 * One field and a Send button. The reason is required and is the whole dialog:
 * an officer deciding this has to have something to decide on, and "approve or
 * deny" against a bare name is not a decision anybody can defend afterwards.
 */
export function ProxyRequestDialog({
  voteId,
  open,
  onOpenChange,
  onSent,
}: {
  voteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api.requestProxy(voteId, reason.trim());
      await onSent();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a proxy</DialogTitle>
          <DialogDescription>
            E-Council decides these before the vote opens. Opening the vote denies
            anything still waiting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="proxy-reason">Why can&apos;t you be there?</Label>
          <Textarea
            id="proxy-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Away for a co-op interview, back Thursday."
            rows={4}
            autoFocus
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>Couldn&apos;t send your request</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!reason.trim() || sending} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Who has asked to vote before the room does, and what was decided.
 *
 * The one part of this feature with names on it, and deliberately so. A proxy
 * request is an administrative decision about a person, not a ballot: the
 * ballot that follows is stored somewhere else entirely and never joined back
 * to this.
 */
export function ProxyQueueDialog({
  voteId,
  open,
  onOpenChange,
  onChanged,
}: {
  voteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [queue, setQueue] = React.useState<ProxyQueue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [deciding, setDeciding] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setQueue(await api.proxyQueue(voteId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [voteId]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function decide(request: ProxyRequest, approved: boolean) {
    setDeciding(request.clerkId);
    setError(null);
    try {
      await api.decideProxy(voteId, request.clerkId, approved);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That decision could not be saved.");
    } finally {
      setDeciding(null);
    }
  }

  const pending = queue?.requests.filter((r) => r.status === "pending") ?? [];
  const decided = queue?.requests.filter((r) => r.status !== "pending") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Proxy requests</DialogTitle>
          <DialogDescription>
            Decide these before you open the vote. Opening it denies anything still
            waiting.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : !queue?.requests.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nobody has asked to vote by proxy.
          </p>
        ) : (
          <div className="space-y-4">
            {pending.map((request) => (
              <div key={request.clerkId} className="rounded-lg border p-4">
                <p className="font-medium">{request.name}</p>
                {request.rollNo ? (
                  <p className="font-mono text-xs text-muted-foreground">#{request.rollNo}</p>
                ) : null}
                {request.reason ? (
                  <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={deciding !== null}
                    onClick={() => void decide(request, false)}
                  >
                    <X className="size-4" />
                    Deny
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={deciding !== null}
                    onClick={() => void decide(request, true)}
                  >
                    {deciding === request.clerkId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Approve
                  </Button>
                </div>
              </div>
            ))}

            {decided.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Decided
                </p>
                {decided.map((request) => (
                  <div
                    key={request.clerkId}
                    className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{request.name}</p>
                      {request.reason ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {request.reason}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={request.status === "approved" ? "success" : "muted"}
                      className="shrink-0"
                    >
                      {request.status === "approved" ? (
                        <Check className="size-3" />
                      ) : (
                        <X className="size-3" />
                      )}
                      {request.status === "approved" ? "Approved" : "Denied"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}

            {!pending.length && decided.length ? (
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Clock className="size-3" aria-hidden="true" />
                Nothing waiting on a decision.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
