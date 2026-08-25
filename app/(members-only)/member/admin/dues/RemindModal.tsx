"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CircleAlert, Info } from "lucide-react";

import { LoadingSpinner } from "../../../components/LoadingState";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Preview = {
  wouldSendCount: number;
  cooldownCount: number;
  excludedCount: number;
  willSend: Array<{ rollNo: string; name: string; template: string; amountCents: number }>;
  skipped: Array<{ rollNo: string; name: string; reason: string }>;
};

const TEMPLATE_LABELS: Record<string, string> = {
  assigned: "Dues assigned",
  upcoming: "Due in a week",
  due_soon: "Due tomorrow",
  due_today: "Due today",
  overdue: "Overdue",
  installment_due: "Plan installment",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/// The count before the send, not after.
///
/// A treasurer who presses "remind everyone" and only then learns it went to
/// eleven people has been surprised by their own chapter's inbox. The dry run
/// costs one request and turns the cooldown from something that fights them
/// into something they can see working.
export default function RemindModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/reminders");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't work out who to remind");
      setPreview(payload);
    } catch (err: any) {
      setError(err.message || "Couldn't work out who to remind");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't send the reminders");
      onSent(payload.summary || "Reminders sent.");
    } catch (err: any) {
      setError(err.message || "Couldn't send the reminders");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !sending) onClose();
      }}
    >
      <DialogContent className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>Send reminders</DialogTitle>
          <DialogDescription>
            Check who gets a reminder before anything is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {loading ? (
            <div
              className="flex justify-center py-6"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Working out who to remind…</span>
              <LoadingSpinner />
            </div>
          ) : preview ? (
            <>
              <p className="text-sm text-foreground">
                <strong className="font-semibold">
                  {preview.wouldSendCount}
                </strong>{" "}
                {preview.wouldSendCount === 1 ? "person" : "people"} will be
                reminded.
              </p>

              {(preview.cooldownCount > 0 || preview.excludedCount > 0) && (
                <Alert>
                  <Info aria-hidden="true" />
                  <AlertDescription className="space-y-1 text-xs">
                    {preview.cooldownCount > 0 && (
                      <p>
                        {preview.cooldownCount} already had this reminder in the
                        last 24 hours and won&apos;t get another.
                      </p>
                    )}
                    {preview.excludedCount > 0 && (
                      <p>
                        {preview.excludedCount} are waiting on you or already up
                        to date. Nobody gets chased for money
                        they&apos;ve already dealt with.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {preview.willSend.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead className="text-right">Owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.willSend.map((row) => (
                        <TableRow key={row.rollNo}>
                          <TableCell>
                            <p className="text-sm font-semibold text-foreground">
                              {row.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              #{row.rollNo}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {TEMPLATE_LABELS[row.template] ?? row.template}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {money(row.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {preview.skipped.length > 0 && (
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Who isn&apos;t being reminded, and why
                  </summary>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {preview.skipped.map((row) => (
                      <li key={row.rollNo}>
                        {row.name}: {row.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : null}

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={sending || loading || !preview?.wouldSendCount}
            onClick={send}
          >
            {sending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Bell aria-hidden="true" />
            )}
            {sending ? "Sending…" : `Remind ${preview?.wouldSendCount ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
