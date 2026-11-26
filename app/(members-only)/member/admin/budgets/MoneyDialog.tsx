"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { budgetFetch, money, toCents, todayYmd, type Budget } from "../../../components/budget/api";
import { FieldError } from "../../../components/budget/ui";

export type MoneyKind = "allocation" | "adjustment" | "income" | "direct_spend" | "transfer";

const TITLES: Record<MoneyKind, { title: string; description: string }> = {
  allocation: { title: "Add money", description: "Put more money on a line." },
  adjustment: { title: "Adjust total", description: "Raise or lower the budget. Use a minus sign to lower it." },
  income: { title: "Record income", description: "Money this committee brought in." },
  direct_spend: { title: "Record chapter spending", description: "A chapter card or check purchase, with no reimbursement." },
  transfer: { title: "Move money", description: "To another line or another committee." },
};

const NONE = "__unassigned";

export function MoneyDialog({
  kind,
  budget,
  budgets,
  onClose,
  onDone,
}: {
  kind: MoneyKind;
  budget: Budget;
  budgets: Budget[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const lines = budget.lines.filter((l) => !l.archived);
  const [lineId, setLineId] = useState(lines[0]?._id ?? NONE);
  const [toBudgetId, setToBudgetId] = useState(budget._id);
  const target = budgets.find((b) => b._id === toBudgetId) ?? budget;
  const targetLines = target.lines.filter((l) => !l.archived);
  const [toLineId, setToLineId] = useState(NONE);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayYmd());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = toCents(amount);
  const from = budget.lines.find((l) => (l._id ?? NONE) === lineId);
  const free = Math.max(0, from?.totals.availableCents ?? 0);
  const needsNote = kind !== "allocation" && kind !== "income";
  // Everything the server would refuse, worked out as you type so Save is
  // never pressed on something that can't go through.
  const amountProblem = (() => {
    if (cents === null) return null;
    if (cents === 0) return "Enter an amount";
    if (kind !== "adjustment" && cents < 0) return "Must be more than $0";
    if (kind === "transfer" && cents > free) return `Only ${money(free)} is free on ${from?.name ?? "that line"}`;
    if (kind === "adjustment" && cents < 0 && -cents > free) return `Can't lower by more than the ${money(free)} free on ${from?.name ?? "that line"}`;
    return null;
  })();
  const sameSpot = kind === "transfer" && toBudgetId === budget._id && (toLineId === NONE ? NONE : toLineId) === lineId;
  const invalid = cents === null || Boolean(amountProblem) || sameSpot || (needsNote && !note.trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await budgetFetch(`/api/budgets/ledger/${budget._id}`, {
        method: "POST",
        json: {
          kind,
          lineId: lineId === NONE ? null : lineId,
          amountCents: cents,
          note: note.trim(),
          occurredOn: kind === "direct_spend" ? occurredOn : undefined,
          toBudgetId: kind === "transfer" ? toBudgetId : undefined,
          toLineId: kind === "transfer" ? (toLineId === NONE ? null : toLineId) : undefined,
        },
      });
      onDone(`${TITLES[kind].title}: ${money(cents)} done.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLES[kind].title}</DialogTitle>
          <DialogDescription>{budget.committee.name}. {TITLES[kind].description}</DialogDescription>
        </DialogHeader>
        <form id="money-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{kind === "transfer" ? "From line" : "Line"}</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l._id ?? NONE} value={l._id ?? NONE}>{l.name} ({money(l.totals.availableCents)})</SelectItem>
                  ))}
                  {!lines.some((l) => l._id === null) ? <SelectItem value={NONE}>Unassigned</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="money-amount">Amount</Label>
              <CurrencyInput id="money-amount" step="0.01" min={kind === "adjustment" ? undefined : "0"} aria-invalid={Boolean(amountProblem)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amountProblem ? (
                <FieldError>{amountProblem}</FieldError>
              ) : (kind === "transfer" || kind === "adjustment") && from ? (
                <p className="text-xs text-muted-foreground">{money(free)} free</p>
              ) : null}
            </div>
          </div>
          {kind === "transfer" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>To committee</Label>
                <Select value={toBudgetId} onValueChange={(v) => { setToBudgetId(v); setToLineId(NONE); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {budgets.filter((b) => b.status === "open").map((b) => <SelectItem key={b._id} value={b._id}>{b.committee.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To line</Label>
                <Select value={toLineId} onValueChange={setToLineId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {targetLines.filter((l) => l._id !== null).map((l) => <SelectItem key={l._id!} value={l._id!}>{l.name}</SelectItem>)}
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          {sameSpot ? <FieldError>Pick a different line or committee to move it to</FieldError> : null}
          {kind === "direct_spend" ? (
            <div className="space-y-2">
              <Label>Bought on</Label>
              <DatePicker value={occurredOn} onChange={setOccurredOn} maxDate={new Date()} placeholder="Choose the day" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="money-note">{kind === "direct_spend" ? "What was bought" : needsNote ? "Reason" : "Note"}</Label>
            <Input id="money-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          {error ? (
            <Alert variant="destructive" role="alert"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="money-form" disabled={invalid || saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
