"use client";

import { useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { budgetFetch, dollarsInput, money, toCents, type Budget, type BudgetRequest } from "../../../components/budget/api";
import { RequestRow } from "../../../components/budget/RequestRow";
import { FieldError } from "../../../components/budget/ui";

function ErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

/// Approve (all or part), send back, or deny. The over-budget box only shows
/// when approving would take the committee negative, and approval is
/// refused until it is ticked.
export function ReviewDialog({ request, budget, onClose, onDone }: { request: BudgetRequest; budget: Budget | undefined; onClose: () => void; onDone: (m: string) => void }) {
  const [mode, setMode] = useState<"approve" | "return" | "deny">("approve");
  const [amount, setAmount] = useState(dollarsInput(request.amountCents));
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = toCents(amount) ?? 0;
  const partial = cents < request.amountCents;
  const line = budget?.lines.find((l) => l._id === request.lineId) ?? budget?.lines.find((l) => l._id === null);
  // A claim against an approved hold spends money that is already set
  // aside, which only the server can net out exactly. For those, the
  // override box appears if the server says it's needed.
  const [serverWantsOverride, setServerWantsOverride] = useState(false);
  const committeeAfter = (budget?.totals.availableCents ?? 0) - cents;
  const needsOverride = mode === "approve" && ((!request.preapprovalId && committeeAfter < 0) || serverWantsOverride);
  const lineAfter = (line?.totals.availableCents ?? 0) - cents;
  const needsNote = mode !== "approve" || partial;
  const invalid = (needsNote && !note.trim()) || (mode === "approve" && (cents <= 0 || cents > request.amountCents)) || (needsOverride && !override);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await budgetFetch(`/api/budgets/requests/${request._id}`, {
        method: "PATCH",
        json: { action: mode, approvedCents: mode === "approve" ? cents : undefined, note: note.trim(), overrideConfirmed: override },
      });
      onDone(mode === "approve" ? `Approved ${money(cents)}.` : mode === "deny" ? "Denied." : "Sent back.");
    } catch (err: any) {
      if (/override/i.test(err.message)) setServerWantsOverride(true);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Review {request.kind === "claim" ? "claim" : "spending request"}</DialogTitle>
          <DialogDescription>{request.committeeName}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-border"><RequestRow request={request} /></div>
        {budget ? (
          <p className="text-sm text-muted-foreground">
            {request.lineName} has {money(line?.totals.availableCents ?? 0)} free. {request.committeeName} has {money(budget.totals.availableCents)} free in total.
            {request.preapprovalId ? " This claim uses an approved hold." : ""}
          </p>
        ) : null}
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="approve">Approve</TabsTrigger>
            <TabsTrigger value="return">Send back</TabsTrigger>
            <TabsTrigger value="deny">Deny</TabsTrigger>
          </TabsList>
        </Tabs>
        <form id="review-form" onSubmit={submit} className="space-y-4">
          {mode === "approve" ? (
            <div className="space-y-2">
              <Label htmlFor="review-amount">Approve</Label>
              <CurrencyInput id="review-amount" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {cents <= 0 ? (
                <FieldError>Enter an amount above $0</FieldError>
              ) : cents > request.amountCents ? (
                <FieldError>Can&apos;t approve more than the {money(request.amountCents)} asked for</FieldError>
              ) : partial ? (
                <p className="text-xs text-muted-foreground">Partial: {money(cents)} of {money(request.amountCents)}. Add a note saying why.</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="review-note">{needsNote ? "Note for the head" : "Note (optional)"}</Label>
            <Textarea id="review-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </div>
          {mode === "approve" && lineAfter < 0 && !needsOverride && !request.preapprovalId ? (
            <Alert><TriangleAlert aria-hidden="true" /><AlertDescription>{request.lineName} goes {money(-lineAfter)} negative. The committee still has money elsewhere.</AlertDescription></Alert>
          ) : null}
          {needsOverride ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="space-y-3">
                <p>This puts {request.committeeName} over budget{committeeAfter < 0 ? ` by ${money(-committeeAfter)}` : ""}.</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={override} onCheckedChange={(v) => setOverride(Boolean(v))} /> Approve over budget anyway (logged)
                </label>
              </AlertDescription>
            </Alert>
          ) : null}
          <ErrorAlert error={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="review-form" variant={mode === "deny" ? "destructive" : "default"} disabled={invalid || saving}>
            {saving ? "Saving…" : mode === "approve" ? "Approve" : mode === "deny" ? "Deny" : "Send back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const METHODS = [
  { value: "credit", label: "Dues credit" },
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

export function PayDialog({ request, onClose, onDone }: { request: BudgetRequest; onClose: () => void; onDone: (m: string) => void }) {
  const [method, setMethod] = useState("venmo");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = request.approvedCents ?? request.amountCents;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await budgetFetch<{ appliedCents: number }>(`/api/budgets/requests/${request._id}`, { method: "PATCH", json: { action: "pay", method, reference: reference.trim() } });
      onDone(
        method === "credit"
          ? `Paid ${money(amount)} as dues credit${data.appliedCents ? `, ${money(data.appliedCents)} applied to what they owe` : ""}.`
          : `Recorded ${money(amount)} paid by ${method}.`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {money(amount)}</DialogTitle>
          <DialogDescription>To {request.submittedBy?.name ?? "the head"} for "{request.description}"</DialogDescription>
        </DialogHeader>
        <form id="pay-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>How</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            {method === "credit" ? <p className="text-xs text-muted-foreground">Comes off anything they owe in dues first. The rest stays as credit.</p> : null}
          </div>
          {method !== "credit" ? (
            <div className="space-y-2">
              <Label htmlFor="pay-ref">Reference</Label>
              <Input id="pay-ref" placeholder="Venmo note, check number" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
            </div>
          ) : null}
          <ErrorAlert error={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="pay-form" disabled={saving}>{saving ? "Saving…" : "Mark paid"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE = "__unassigned";

export function RetagDialog({ request, budgets, onClose, onDone }: { request: BudgetRequest; budgets: Budget[]; onClose: () => void; onDone: (m: string) => void }) {
  const [budgetId, setBudgetId] = useState(request.budgetId ?? budgets[0]?._id ?? "");
  const target = budgets.find((b) => b._id === budgetId);
  const [lineId, setLineId] = useState(NONE);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sameSpot = target?._id === request.budgetId && (lineId === NONE ? null : lineId) === request.lineId;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!note.trim() || saving || !target || sameSpot) return;
    setSaving(true);
    setError(null);
    try {
      await budgetFetch(`/api/budgets/requests/${request._id}`, {
        method: "PATCH",
        json: { action: "retag", committeeId: target.committee._id, lineId: lineId === NONE ? null : lineId, note: note.trim(), overrideConfirmed: override },
      });
      onDone(`Moved to ${target.committee.name}.`);
    } catch (err: any) {
      if (/override/i.test(err.message)) setNeedsOverride(true);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Move request</DialogTitle>
          <DialogDescription>"{request.description}" is on {request.committeeName} / {request.lineName}.</DialogDescription>
        </DialogHeader>
        <form id="retag-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Committee</Label>
              <Select value={budgetId} onValueChange={(v) => { setBudgetId(v); setLineId(NONE); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{budgets.filter((b) => b.status === "open").map((b) => <SelectItem key={b._id} value={b._id}>{b.committee.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Line</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(target?.lines ?? []).filter((l) => l._id && !l.archived).map((l) => <SelectItem key={l._id!} value={l._id!}>{l.name}</SelectItem>)}
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {sameSpot ? <FieldError>It&apos;s already there. Pick a different committee or line.</FieldError> : null}
          <div className="space-y-2">
            <Label htmlFor="retag-note">Reason</Label>
            <Input id="retag-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          {needsOverride ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={override} onCheckedChange={(v) => setOverride(Boolean(v))} /> Move it over budget anyway (logged)
            </label>
          ) : null}
          <ErrorAlert error={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="retag-form" disabled={saving || !note.trim() || sameSpot}>{saving ? "Moving…" : "Move"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
