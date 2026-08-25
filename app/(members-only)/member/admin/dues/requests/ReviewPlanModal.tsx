"use client";

import { useState } from "react";
import { CircleAlert, Info } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type QueuedInstallment = {
  seq: number;
  dueDate: string | null;
  amountCents: number;
  status: string;
};

export type QueuedPlan = {
  _id: string;
  status: string;
  totalCents: number;
  installmentCount: number;
  installments: QueuedInstallment[];
  proposedAt: string | null;
  proposedAgainstDueDate: string | null;
  requestNote: string;
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
  charges: Array<{
    _id: string;
    description: string;
    term: string;
    balanceCents: number;
    dueDate: string | null;
  }>;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(iso: string | null) {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ReviewPlanModal({
  plan,
  onClose,
  onReviewed,
}: {
  plan: QueuedPlan;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "deny") {
    if (saving) return;
    if (action === "deny" && !reviewNote.trim()) {
      setError("Say why. The member sees this, and a denial with no reason is how this stops being trusted.");
      return;
    }
    setSaving(action);
    setError(null);
    try {
      const res = await fetch(`/api/dues/plans/${plan._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't record that");
      const who = plan.member ? plan.member.fName : "The member";
      onReviewed(
        action === "approve"
          ? `Plan approved. ${who} now owes ${money(plan.installments[0]?.amountCents ?? 0)} on ${dayLabel(plan.installments[0]?.dueDate ?? null)}, then monthly.`
          : `Plan denied. ${who} has five days before the full balance reads as late.`
      );
    } catch (err: any) {
      setError(err.message || "Couldn't record that");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && saving === null) onClose();
      }}
    >
      <DialogContent className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>Payment plan request</DialogTitle>
          <DialogDescription>
            #{plan.member?.rollNo ?? "Unknown"} &middot; asked{" "}
            {dayLabel(plan.proposedAt)}
            {plan.ageDays > 0 && ` · waiting ${plan.ageDays}d`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-sm font-semibold text-foreground">
            {plan.member
              ? `${plan.member.fName} ${plan.member.lName}`
              : "Unknown member"}
          </p>

          {/* The original deadline travels with the request, because the only
              question that matters is whether they asked before it. */}
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription className="text-xs">
              Filed against a due date of{" "}
              <strong className="font-semibold">
                {dayLabel(plan.proposedAgainstDueDate)}
              </strong>
              . The schedule below is allowed to run past it: the deadline
              limits when they could ask, not when they can pay.
            </AlertDescription>
          </Alert>

          {plan.requestNote && (
            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
              {plan.requestNote}
            </blockquote>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {money(plan.totalCents)} over {plan.installmentCount} months
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {plan.installments.map((installment) => (
                <li
                  key={installment.seq}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">
                    {dayLabel(installment.dueDate)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {money(installment.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {plan.charges.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Covers{" "}
              {plan.charges
                .map(
                  (charge) =>
                    `${charge.description} (${money(charge.balanceCents)})`
                )
                .join(", ")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="plan-review-note">
              Note{" "}
              <span className="font-normal text-muted-foreground">
                (required to deny)
              </span>
            </Label>
            <Textarea
              id="plan-review-note"
              rows={2}
              maxLength={500}
              placeholder="Why this doesn't work, in words they can act on"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
            />
          </div>

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
            disabled={saving !== null}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={saving !== null}
            onClick={() => review("deny")}
          >
            {saving === "deny" && <LoadingSpinner size="sm" />}
            Deny
          </Button>
          <Button
            type="button"
            disabled={saving !== null}
            onClick={() => review("approve")}
          >
            {saving === "approve" && <LoadingSpinner size="sm" />}
            Approve plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
