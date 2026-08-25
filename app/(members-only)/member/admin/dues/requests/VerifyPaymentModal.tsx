"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { LoadingSpinner } from "../../../../components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type QueuedSubmission = {
  _id: string;
  amountCents: number;
  method: string;
  reference: string;
  paidOn: string | null;
  submittedAt: string | null;
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
  charge: {
    description: string;
    term: string;
    balanceCents: number;
    dueDate: string | null;
  } | null;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/// An ISO instant rendered as the chapter's calendar day, for a date input.
function toDateInput(iso: string | null) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Phoenix",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function VerifyPaymentModal({
  submission,
  onClose,
  onReviewed,
}: {
  submission: QueuedSubmission;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  // Pre-filled with what the member said, deliberately — not today. An officer
  // clearing a week-old backlog shouldn't have to remember to backdate; the
  // fair outcome is the one that happens when they just click approve.
  const [paidOn, setPaidOn] = useState(toDateInput(submission.paidOn));
  const [amount, setAmount] = useState((submission.amountCents / 100).toFixed(2));
  const [reviewNote, setReviewNote] = useState("");
  const [mode, setMode] = useState<"verify" | "reject">("verify");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const name = submission.member
    ? `${submission.member.fName} ${submission.member.lName}`
    : "Unknown member";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (mode === "reject" && !reviewNote.trim()) {
      setError("Give them a reason. They'll see it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dues/submissions/${submission._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "verify"
            ? { action: "verify", paidOn, amountCents, reviewNote: reviewNote.trim() }
            : { action: "reject", reviewNote: reviewNote.trim() }
        ),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't save that");
      onReviewed(
        mode === "verify"
          ? `Verified ${money(amountCents)} from ${name}.`
          : `Sent ${name}'s claim back with a reason.`
      );
    } catch (err: any) {
      setError(err.message || "Couldn't save that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-lg"
        /* No backdrop dismissal while reviewing a payment claim. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Review payment</DialogTitle>
          <DialogDescription>
            {submission.charge?.description} &middot; {submission.charge?.term}{" "}
            &middot; claimed {money(submission.amountCents)} by{" "}
            {submission.method}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {name}{" "}
              <span className="font-normal text-muted-foreground">
                #{submission.member?.rollNo ?? "Unknown"}
              </span>
            </p>
            {submission.reference && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Reference: {submission.reference}
              </p>
            )}
          </div>

          {/* Was a Bootstrap nav-pills list of plain buttons with no tab
            * semantics; Tabs gives roving focus and arrow-key navigation. */}
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "verify" | "reject")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="verify">Verify</TabsTrigger>
              <TabsTrigger value="reject">Reject</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "verify" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="verify-paid-on">Date paid</Label>
                <DatePicker
                  id="verify-paid-on"
                  value={paidOn}
                  onChange={setPaidOn}
                  aria-describedby="verify-paid-on-hint"
                />
                <p
                  id="verify-paid-on-hint"
                  className="text-xs text-muted-foreground"
                >
                  Pre-filled with the date {submission.member?.fName ?? "they"}{" "}
                  gave. This is what decides whether they paid on time, so leave
                  it alone unless you know it&apos;s wrong. It is not affected
                  by how long this sat in the queue.
                  {submission.ageDays > 0 &&
                    ` (Filed ${submission.ageDays} day${
                      submission.ageDays === 1 ? "" : "s"
                    } ago.)`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="verify-amount">Amount</Label>
                <CurrencyInput
                    id="verify-amount"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    aria-describedby={
                    submission.charge ? "verify-amount-hint" : undefined
                    }
                  />
                {submission.charge && (
                  <p
                    id="verify-amount-hint"
                    className="text-xs text-muted-foreground"
                  >
                    {money(submission.charge.balanceCents)} outstanding on this
                    charge.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="verify-note">
              {mode === "reject" ? "Why?" : "Note"}{" "}
              {mode === "verify" && (
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              )}
            </Label>
            <Textarea
              id="verify-note"
              rows={2}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder={
                mode === "reject"
                  ? "Couldn't find this in the Venmo history. Can you send a screenshot?"
                  : ""
              }
              aria-describedby={
                mode === "reject" ? "verify-note-hint" : undefined
              }
            />
            {mode === "reject" && (
              <p id="verify-note-hint" className="text-xs text-muted-foreground">
                They&apos;ll see this, and both the claim and your reason stay in
                their history.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
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
              variant={mode === "verify" ? "default" : "destructive"}
              disabled={saving}
            >
              {saving && <LoadingSpinner size="sm" />}
              {saving
                ? "Saving…"
                : mode === "verify"
                ? "Verify payment"
                : "Reject claim"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
