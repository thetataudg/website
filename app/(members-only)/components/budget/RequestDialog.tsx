"use client";

import { useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { budgetFetch, dollarsInput, money, toCents, todayYmd, type Budget, type BudgetRequest } from "./api";
import { ReceiptPicker, type Receipt } from "./ReceiptPicker";
import { FieldError } from "./ui";

const UNASSIGNED = "__unassigned";

/// File a claim or a pre-approval, or fix one that was sent back.
export function RequestDialog({
  budget,
  kind,
  existing,
  preapproval,
  onClose,
  onSaved,
}: {
  budget: Budget;
  kind: "claim" | "preapproval";
  existing?: BudgetRequest | null;
  /// Filing the claim for an approved pre-approval.
  preapproval?: BudgetRequest | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const lines = budget.lines.filter((l) => !l.archived);
  const [amount, setAmount] = useState(dollarsInput(existing?.amountCents ?? preapproval?.approvedCents ?? null));
  const [description, setDescription] = useState(existing?.description ?? preapproval?.description ?? "");
  const [lineId, setLineId] = useState<string>(existing?.lineId ?? preapproval?.lineId ?? lines[0]?._id ?? UNASSIGNED);
  const [purchasedOn, setPurchasedOn] = useState(existing?.purchasedOn?.slice(0, 10) ?? todayYmd());
  const [receipts, setReceipts] = useState<Receipt[]>(
    (existing?.receiptUrls ?? []).map((url, i) => ({ url: url.split("?")[0], name: `Receipt ${i + 1}` }))
  );
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = toCents(amount);
  const line = budget.lines.find((l) => (l._id ?? UNASSIGNED) === lineId);
  const free = (line?.totals.availableCents ?? 0) + (preapproval ? preapproval.approvedCents ?? 0 : 0);
  const overLine = cents !== null && cents > free;
  const overCommittee = cents !== null && cents - (preapproval?.approvedCents ?? 0) > budget.totals.availableCents;
  const lockedLine = Boolean(preapproval || existing?.preapprovalId);
  const invalid = cents === null || cents <= 0 || !description.trim() || (kind === "claim" && !receipts.length);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        amountCents: cents,
        description: description.trim(),
        lineId: lineId === UNASSIGNED ? null : lineId,
        purchasedOn: kind === "claim" ? purchasedOn : undefined,
        receiptUrls: receipts.map((r) => r.url),
      };
      if (existing) {
        await budgetFetch(`/api/budgets/requests/${existing._id}`, { method: "PATCH", json: { action: "edit", ...body } });
        onSaved(existing.status === "returned" ? "Resubmitted." : "Saved.");
      } else {
        await budgetFetch("/api/budgets/requests", {
          method: "POST",
          json: { ...body, committeeId: budget.committee._id, term: budget.term, kind, preapprovalId: preapproval?._id },
        });
        onSaved(kind === "claim" ? "Claim sent to the treasurer." : "Request sent to the treasurer.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const title = existing
    ? existing.status === "returned" ? "Fix and resubmit" : "Edit request"
    : kind === "claim" ? "Submit a receipt" : "Request money";

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "claim" ? "For money you already spent." : "Ask before you buy. Approved money is held for you."}
          </DialogDescription>
        </DialogHeader>
        {existing?.status === "returned" && existing.reviewNote ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>Treasurer: {existing.reviewNote}</AlertDescription>
          </Alert>
        ) : null}
        <form id="budget-request-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="req-desc">{kind === "claim" ? "What you bought" : "What it's for"}</Label>
            <Input id="req-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="req-amount">Amount</Label>
              <CurrencyInput id="req-amount" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amount.trim() && (cents === null || cents <= 0) ? <FieldError>Must be more than $0</FieldError> : null}
              {preapproval && cents !== null && preapproval.approvedCents !== null && cents > preapproval.approvedCents ? (
                <p className="text-xs text-muted-foreground">{money(preapproval.approvedCents)} was approved. The rest needs the treasurer&apos;s OK.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Line</Label>
              <Select value={lineId} onValueChange={setLineId} disabled={lockedLine}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l._id ?? UNASSIGNED} value={l._id ?? UNASSIGNED}>
                      {l.name} ({money(l.totals.availableCents)} left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "claim" ? (
            <>
              <div className="space-y-2">
                <Label>Bought on</Label>
                <DatePicker value={purchasedOn} onChange={setPurchasedOn} maxDate={new Date()} placeholder="Choose the day" />
              </div>
              <div className="space-y-2">
                <Label asChild><p>Receipt</p></Label>
                <ReceiptPicker receipts={receipts} onChange={setReceipts} onError={setError} onBusy={setBusy} />
                {!receipts.length ? <p className="text-xs text-muted-foreground">Required. A photo or PDF of the receipt.</p> : null}
              </div>
            </>
          ) : null}
          {overCommittee ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>This is more than your committee has left. The treasurer would have to approve it over budget.</AlertDescription>
            </Alert>
          ) : overLine ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>More than this line has left.</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving || busy}>Cancel</Button>
          <Button type="submit" form="budget-request-form" disabled={invalid || saving || busy}>
            {saving ? "Sending…" : existing ? (existing.status === "returned" ? "Resubmit" : "Save") : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
