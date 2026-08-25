"use client";

import { useState } from "react";
import { CircleAlert, Receipt, TriangleAlert } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type QueuedReimbursement = {
  _id: string;
  amountCents: number;
  description: string;
  category: string;
  purchasedOn: string | null;
  receiptUrls: string[];
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export default function ReviewReimbursementModal({
  reimbursement,
  onClose,
  onReviewed,
}: {
  reimbursement: QueuedReimbursement;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  const [mode, setMode] = useState<"approve" | "deny">("approve");
  const [amount, setAmount] = useState(
    (reimbursement.amountCents / 100).toFixed(2)
  );
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const name = reimbursement.member
    ? `${reimbursement.member.fName} ${reimbursement.member.lName}`
    : "Unknown member";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (mode === "deny" && !reviewNote.trim()) {
      setError("Give them a reason. They'll see it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reimbursements/${reimbursement._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "approve"
            ? { action: "approve", amountCents, reviewNote: reviewNote.trim() }
            : { action: "deny", reviewNote: reviewNote.trim() }
        ),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't save that");

      if (mode === "deny") {
        onReviewed(`Denied ${name}'s claim.`);
        return;
      }

      // Say what actually happened to the money, not just that it was
      // approved — where it landed is the part the treasurer needs to know.
      const applied = payload?.applied?.appliedCents ?? 0;
      const credit = payload?.creditCents ?? 0;
      const parts = [`Approved ${money(amountCents)} for ${name}.`];
      if (applied > 0) parts.push(`${money(applied)} came off what they owe.`);
      if (credit > 0) parts.push(`${money(credit)} is held as credit.`);
      onReviewed(parts.join(" "));
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
        className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        /* No backdrop dismissal while reviewing a money claim. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>Review reimbursement</DialogTitle>
          <DialogDescription>
            {reimbursement.description} &middot; {reimbursement.category}
            {reimbursement.purchasedOn &&
              ` · bought ${new Date(
                reimbursement.purchasedOn
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "America/Phoenix",
              })}`}
          </DialogDescription>
        </DialogHeader>

        <form
          id="reimbursement-review-form"
          onSubmit={submit}
          className="space-y-4 overflow-y-auto px-6 py-5"
        >
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {name}{" "}
              <span className="font-normal text-muted-foreground">
                #{reimbursement.member?.rollNo ?? "Unknown"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Claimed {money(reimbursement.amountCents)} &middot; waiting{" "}
              {reimbursement.ageDays}d
            </p>
          </div>

          {reimbursement.receiptUrls.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipts
              </p>
              <div className="flex flex-wrap gap-2">
                {reimbursement.receiptUrls.map((url, index) => (
                  <Button key={url} variant="outline" size="sm" asChild>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="no-underline"
                    >
                      <Receipt aria-hidden="true" />
                      Receipt {index + 1}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="text-xs">
                No receipt attached. Worth asking for one before approving.
              </AlertDescription>
            </Alert>
          )}

          {/* Was a Bootstrap nav-pills list of plain buttons with no tab
            * semantics; Tabs gives roving focus and arrow-key navigation. */}
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "approve" | "deny")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="approve">Approve</TabsTrigger>
              <TabsTrigger value="deny">Deny</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "approve" && (
            <div className="space-y-1.5">
              <Label htmlFor="reimb-approve-amount">Amount to approve</Label>
              <CurrencyInput
                  id="reimb-approve-amount"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  aria-describedby="reimb-approve-amount-hint"
                />
              <p
                id="reimb-approve-amount-hint"
                className="text-xs text-muted-foreground"
              >
                Comes off what they owe first. Anything left over is held as
                credit against their next dues, or you can pay it out from the
                roster.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reimb-note">
              {mode === "deny" ? "Why?" : "Note"}{" "}
              {mode === "approve" && (
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              )}
            </Label>
            <Textarea
              id="reimb-note"
              rows={2}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder={
                mode === "deny"
                  ? "This one needs a receipt before I can approve it."
                  : ""
              }
              aria-describedby={mode === "deny" ? "reimb-note-hint" : undefined}
            />
            {mode === "deny" && (
              <p id="reimb-note-hint" className="text-xs text-muted-foreground">
                They&apos;ll see this, and it stays in their history.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>

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
            form="reimbursement-review-form"
            variant={mode === "approve" ? "default" : "destructive"}
            disabled={saving}
          >
            {saving && <LoadingSpinner size="sm" />}
            {saving
              ? "Saving…"
              : mode === "approve"
              ? "Approve claim"
              : "Deny claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
