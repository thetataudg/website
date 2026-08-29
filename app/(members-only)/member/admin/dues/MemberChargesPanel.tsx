"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Trash2 } from "lucide-react";

import { LoadingSpinner } from "../../../components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { SectionHeader } from "../../../components/shell/PageShell";

type Charge = {
  _id: string;
  term: string;
  description: string;
  amountCents: number;
  paidCents: number;
  memberPaidCents: number;
  balanceCents: number;
  dueDate: string | null;
  status: string;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function dayLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

/// Every charge on one member, with the one action that takes a charge back.
///
/// Removing a charge is a correction, not an accounting entry: the charge was
/// raised on the wrong person, or for the wrong amount, or twice. It stays
/// available right up until money lands against it, at which point the server
/// refuses and the button disappears with it — a paid charge is settled with a
/// refund, not by pretending it was never raised.
export default function MemberChargesPanel({
  rollNo,
  onChanged,
}: {
  rollNo: string;
  onChanged?: () => void;
}) {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Charge | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dues?rollNo=${encodeURIComponent(rollNo)}`
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't load charges");
      setCharges(payload.charges ?? []);
    } catch (err: any) {
      setError(err.message || "Couldn't load charges");
    }
  }, [rollNo]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmVoid() {
    if (!voiding || busy) return;
    setBusy(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/dues/${voiding._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't remove the charge");
      setVoiding(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (err: any) {
      setVoidError(err.message || "Couldn't remove the charge");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlert aria-hidden="true" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!charges) return <LoadingSpinner />;
  if (charges.length === 0) return null;

  return (
    <div className="mb-6">
      <SectionHeader title="Charges" />
      <div className="mt-3 divide-y rounded-lg border">
        {charges.map((charge) => {
          const removable =
            charge.status === "open" && charge.memberPaidCents === 0;
          return (
            <div
              key={charge._id}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {charge.description}
                  </span>
                  {charge.status !== "open" ? (
                    <Badge variant="secondary">
                      {charge.status === "void" ? "Removed" : "Waived"}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {charge.term}
                  {charge.dueDate ? ` · due ${dayLabel(charge.dueDate)}` : ""}
                  {charge.paidCents > 0
                    ? ` · ${money(charge.paidCents)} paid`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold tabular-nums text-foreground">
                  {money(charge.amountCents)}
                </span>
                {removable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setVoidError(null);
                      setReason("");
                      setVoiding(charge);
                    }}
                    aria-label={`Remove the ${charge.description} charge`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {voiding ? (
        <Dialog open onOpenChange={(open) => !open && !busy && setVoiding(null)}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md">
            <DialogHeader>
              <DialogTitle>Remove this charge?</DialogTitle>
              <DialogDescription>
                {money(voiding.amountCents)} for {voiding.description}. The
                member is emailed and notified that it was removed, and the
                charge stays on their record marked as removed rather than
                disappearing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="void-reason">
                Reason{" "}
                <span className="font-normal text-muted-foreground">
                  (shown to the member)
                </span>
              </Label>
              <Textarea
                id="void-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Charged in error"
              />
            </div>
            {voidError ? (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{voidError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setVoiding(null)}
                disabled={busy}
              >
                Keep it
              </Button>
              <Button
                variant="destructive"
                onClick={confirmVoid}
                disabled={busy}
              >
                {busy ? "Removing…" : "Remove charge"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
