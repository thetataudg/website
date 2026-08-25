"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { LoadingSpinner } from "../../components/LoadingState";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  MIN_INSTALLMENT_CENTS,
  buildSchedule,
  maxInstallmentsFor,
} from "@/lib/planMath";

export type PlannableCharge = {
  _id: string;
  description: string;
  balanceCents: number;
  dueDate: string | null;
};

export type PlannableBalance = {
  term: string;
  /// Everything owed that no live plan already covers. The member chooses which
  /// of these this plan is for — a $200 dues charge and a $500 trip deposit are
  /// two different conversations and can be two different schedules.
  charges: PlannableCharge[];
};

function money(cents: number) {
  const abs = Math.abs(cents);
  return (abs / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/// The one screen worth obsessing over.
///
/// The member is agreeing to concrete dates and amounts, so they see concrete
/// dates and amounts — recomputed as they move the count, from the same
/// calculator the server uses. Counts the balance can't support are greyed out
/// rather than accepted and then rejected, because being told "no" after
/// choosing is how a member decides the app is arguing with them.
export default function RequestPlanModal({
  balance,
  onClose,
  onFiled,
}: {
  balance: PlannableBalance;
  onClose: () => void;
  onFiled: () => void;
}) {
  // Everything is selected to start with: covering the lot is the common case,
  // and a member who wants one charge separated out can untick the rest.
  const [selected, setSelected] = useState<string[]>(() =>
    balance.charges.map((charge) => charge._id)
  );
  const [requestNote, setRequestNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => balance.charges.filter((charge) => selected.includes(charge._id)),
    [balance.charges, selected]
  );
  const totalCents = chosen.reduce((sum, charge) => sum + charge.balanceCents, 0);
  // The schedule anchors on the earliest deadline among the charges chosen, so
  // ticking a charge with a nearer due date pulls the whole schedule forward.
  const anchorDueDate =
    chosen
      .map((charge) => charge.dueDate)
      .filter(Boolean)
      .sort()[0] ?? null;

  const maxCount = maxInstallmentsFor(totalCents);
  const [count, setCount] = useState(3);
  // Narrowing the selection can put the current count out of range; clamp it
  // rather than letting the preview show a schedule the server would refuse.
  const effectiveCount = Math.min(Math.max(count, MIN_INSTALLMENTS), Math.max(maxCount, MIN_INSTALLMENTS));

  const schedule = useMemo(
    () => (totalCents > 0 ? buildSchedule(totalCents, effectiveCount, anchorDueDate) : []),
    [totalCents, anchorDueDate, effectiveCount]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || maxCount < MIN_INSTALLMENTS || !chosen.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: balance.term,
          chargeIds: chosen.map((charge) => charge._id),
          installments: effectiveCount,
          requestNote: requestNote.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't send that request");
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't send that request");
    } finally {
      setSaving(false);
    }
  }

  const nothingChosen = chosen.length === 0;
  const tooSmall = !nothingChosen && maxCount < MIN_INSTALLMENTS;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent
        className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        /* No backdrop dismissal: this is a commitment to dates and amounts. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>Request a payment plan</DialogTitle>
          <DialogDescription>
            {money(totalCents)} owed &middot; {balance.term}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="contents">
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {balance.charges.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What should this plan cover?
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {balance.charges.map((charge) => (
                    <li key={charge._id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                        <span className="flex min-w-0 items-center gap-3">
                          <Checkbox
                            checked={selected.includes(charge._id)}
                            onCheckedChange={() => toggle(charge._id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-foreground">
                              {charge.description}
                            </span>
                            {charge.dueDate && (
                              <span className="block text-xs text-muted-foreground">
                                due {dayLabel(new Date(charge.dueDate))}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-foreground">
                          {money(charge.balanceCents)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Anything you leave out stays owed in full. You can put
                  it on its own plan later, as long as you ask before its due
                  date.
                </p>
              </div>
            )}

            {nothingChosen ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  Pick at least one charge for this plan to cover.
                </AlertDescription>
              </Alert>
            ) : tooSmall ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  {money(totalCents)} is too small to spread out.
                  installments can&apos;t be under{" "}
                  {money(MIN_INSTALLMENT_CENTS)}.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label asChild>
                    <p id="plan-count-label">How many months do you need?</p>
                  </Label>
                  <div
                    role="radiogroup"
                    aria-labelledby="plan-count-label"
                    className="flex w-full flex-wrap gap-1.5"
                  >
                    {Array.from(
                      { length: MAX_INSTALLMENTS - MIN_INSTALLMENTS + 1 },
                      (_, index) => index + MIN_INSTALLMENTS
                    ).map((option) => {
                      const allowed = option <= maxCount;
                      const active = option === effectiveCount;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={cn(
                            "h-9 min-w-9 flex-1 rounded-md border text-sm font-semibold transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                            !allowed &&
                              "cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground"
                          )}
                          disabled={!allowed}
                          title={
                            allowed
                              ? undefined
                              : `${money(totalCents)} over ${option} months would be under the ${money(MIN_INSTALLMENT_CENTS)} minimum`
                          }
                          onClick={() => setCount(option)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {maxCount < MAX_INSTALLMENTS && (
                    <p className="text-xs text-muted-foreground">
                      {money(totalCents)} can be split {maxCount} ways at most
                      No installment can be under{" "}
                      {money(MIN_INSTALLMENT_CENTS)}.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your schedule
                  </p>
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {schedule.map((installment) => (
                      <li
                        key={installment.seq}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="text-sm text-muted-foreground">
                          {dayLabel(installment.dueDate)}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {money(installment.amountCents)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-2 bg-muted px-3 py-2">
                      <span className="text-sm text-foreground">Total</span>
                      <span className="text-sm font-semibold text-foreground">
                        {money(
                          schedule.reduce((sum, i) => sum + i.amountCents, 0)
                        )}
                      </span>
                    </li>
                  </ul>
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>
                      Installments are allowed to run past your due date.
                      what matters is that you asked before it. Nothing is
                      agreed until the treasurer approves it, and you won&apos;t
                      be marked late while you wait.
                    </span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plan-note">
                    Anything the treasurer should know{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="plan-note"
                    rows={2}
                    maxLength={500}
                    placeholder="Paycheque lands the 15th, so the 1st is tight"
                    value={requestNote}
                    onChange={(event) => setRequestNote(event.target.value)}
                  />
                </div>
              </>
            )}

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
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={tooSmall || nothingChosen || saving}
            >
              {saving && <LoadingSpinner size="sm" />}
              {saving ? "Sending…" : "Send to the treasurer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
