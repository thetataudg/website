"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Vote as VoteIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { budgetFetch, dollarsInput, money, shortDate, toCents, todayYmd, type Budget } from "../../../components/budget/api";
import { BudgetCardsSkeleton, FieldError } from "../../../components/budget/ui";
import { EmptyState } from "../../../components/shell/States";

interface Pkg {
  _id: string;
  term: string;
  kind: "term" | "single" | "amendment";
  status: string;
  title: string;
  items: { proposalId: string; committeeId: string | null; committeeName: string; version: number; totalCents: number; expectedIncomeCents: number; applied: boolean }[];
  amendment: { committeeName: string; amountCents: number; reason: string } | null;
  totalCents: number;
  expectedIncomeCents: number;
  carryoverCents: number;
  activeCount: number;
  suggestedDuesCents: number | null;
  finalDuesCents: number | null;
  coverageCents: number | null;
  duesAssignedAt: string | null;
  approval: { method: string | null; voteId: string | null; yes: number | null; no: number | null; abstain: number | null; date: string | null; note: string };
  liveVote: { started: boolean; ended: boolean; yes: number; no: number; abstain: number } | null;
}

const STATUS: Record<string, { label: string; variant: any }> = {
  draft: { label: "Draft", variant: "muted" },
  voting: { label: "Voting", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Not approved", variant: "destructive" },
};

export function PackagesTab({
  term,
  committees,
  budgets,
  onChanged,
}: {
  term: string;
  committees: { _id: string; name: string; status: string }[];
  budgets: Budget[];
  onChanged: () => void;
}) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState<null | "term" | "single" | "amendment">(null);
  const [recording, setRecording] = useState<Pkg | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await budgetFetch<{ packages: Pkg[] }>(`/api/budgets/packages?term=${encodeURIComponent(term)}`);
      setPackages(data.packages);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [term]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = (message?: string) => {
    if (message) toast.success(message);
    void load();
    onChanged();
  };

  async function act(pkg: Pkg, action: string, extra: any = {}, message = "Saved.") {
    try {
      await budgetFetch(`/api/budgets/packages/${pkg._id}`, { method: "PATCH", json: { action, ...extra } });
      refresh(message);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setBuilding("term")}>Build {term} package</Button>
        <Button variant="outline" onClick={() => setBuilding("single")}>Vote on one committee</Button>
        <Button variant="outline" onClick={() => setBuilding("amendment")} disabled={!budgets.length}>Amendment</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {packages === null && !error ? <BudgetCardsSkeleton count={2} /> : null}
      {packages && !packages.length ? (
        <EmptyState icon={<VoteIcon aria-hidden="true" />} title={`No ${term} packages yet`} description="Build one once proposals are submitted. It freezes them for the chapter to vote on." />
      ) : null}
      <ul className="grid list-none gap-4 p-0">
        {(packages ?? []).map((pkg) => (
          <li key={pkg._id}>
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{pkg.title}</p>
                    <Badge variant={STATUS[pkg.status]?.variant ?? "muted"}>{STATUS[pkg.status]?.label ?? pkg.status}</Badge>
                    {pkg.kind !== "term" ? <Badge variant="outline">{pkg.kind === "single" ? "One committee" : "Amendment"}</Badge> : null}
                  </div>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{money(pkg.totalCents)}</p>
                </div>

                {pkg.amendment ? (
                  <p className="text-sm text-muted-foreground">{money(pkg.amendment.amountCents)} more for {pkg.amendment.committeeName}: {pkg.amendment.reason}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border p-0 text-sm">
                    {pkg.items.map((i) => (
                      <li key={i.proposalId} className="flex list-none justify-between px-3 py-2">
                        <span className="text-foreground">{i.committeeName} <span className="text-muted-foreground">v{i.version}</span></span>
                        <span className="tabular-nums text-foreground">{money(i.totalCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {pkg.approval.yes !== null ? (
                  <p className="text-sm text-muted-foreground">
                    {pkg.approval.method === "app" ? "In-app vote" : "Recorded vote"}
                    {pkg.approval.date ? ` on ${shortDate(pkg.approval.date)}` : ""}: {pkg.approval.yes} yes, {pkg.approval.no} no, {pkg.approval.abstain} abstain
                    {pkg.approval.note ? `. ${pkg.approval.note}` : ""}
                  </p>
                ) : null}

                {pkg.status === "voting" && pkg.liveVote ? (
                  <Alert>
                    <VoteIcon aria-hidden="true" />
                    <AlertDescription>
                      {!pkg.liveVote.started
                        ? "Vote created. Start it from the vote screen when the chapter is ready."
                        : pkg.liveVote.ended
                          ? `Vote ended: ${pkg.liveVote.yes} yes, ${pkg.liveVote.no} no, ${pkg.liveVote.abstain} abstain.`
                          : `Voting now: ${pkg.liveVote.yes} yes, ${pkg.liveVote.no} no so far.`}{" "}
                      <Link href="/member/vote" className="text-primary hover:underline">Open votes</Link>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {pkg.status === "draft" ? (
                    <>
                      <Button onClick={() => void act(pkg, "open_vote", {}, "Vote created.")}>Put to an in-app vote</Button>
                      <Button variant="outline" onClick={() => setRecording(pkg)}>Record a vote</Button>
                      <Button variant="ghost" onClick={() => void act(pkg, "discard", {}, "Discarded.")}>Discard</Button>
                    </>
                  ) : null}
                  {pkg.status === "voting" ? (
                    <>
                      <Button onClick={() => void act(pkg, "use_vote", {}, "Result saved.")} disabled={!pkg.liveVote?.ended}>Use vote result</Button>
                      <Button variant="outline" onClick={() => setRecording(pkg)}>Record by hand</Button>
                      <Button variant="ghost" onClick={() => void act(pkg, "cancel_vote", {}, "Vote cancelled.")}>Cancel vote</Button>
                    </>
                  ) : null}
                </div>

                {pkg.kind === "term" && pkg.status === "approved" ? <DuesPanel pkg={pkg} onDone={refresh} /> : null}
                {pkg.kind === "term" && pkg.status !== "approved" && pkg.suggestedDuesCents !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Suggested dues: {money(pkg.suggestedDuesCents)} each across {pkg.activeCount} actives ({money(pkg.expectedIncomeCents)} expected income, {money(pkg.carryoverCents)} carried over).
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {building ? (
        <BuildDialog kind={building} term={term} committees={committees} budgets={budgets} onClose={() => setBuilding(null)} onDone={(m) => { setBuilding(null); refresh(m); }} />
      ) : null}
      {recording ? (
        <RecordDialog pkg={recording} onClose={() => setRecording(null)} onDone={(m) => { setRecording(null); refresh(m); }} />
      ) : null}
    </div>
  );
}

function DuesPanel({ pkg, onDone }: { pkg: Pkg; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(dollarsInput(pkg.finalDuesCents ?? pkg.suggestedDuesCents));
  const [dueDate, setDueDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const cents = toCents(amount);
  const need = Math.max(0, pkg.totalCents - pkg.expectedIncomeCents - pkg.carryoverCents);
  const coverage = cents === null ? null : cents * pkg.activeCount - need;

  if (pkg.duesAssignedAt) {
    return <p className="text-sm text-muted-foreground">Dues of {money(pkg.finalDuesCents)} assigned {shortDate(pkg.duesAssignedAt)}.</p>;
  }

  async function assign() {
    if (cents === null || cents <= 0) return;
    setBusy(true);
    try {
      if (cents !== pkg.finalDuesCents) {
        await budgetFetch(`/api/budgets/packages/${pkg._id}`, { method: "PATCH", json: { action: "set_dues", finalDuesCents: cents } });
      }
      const charged = await budgetFetch<{ batchId: string; charges: any[] }>("/api/dues", {
        method: "POST",
        json: { allActive: true, amountCents: cents, term: pkg.term, dueDate, description: "Chapter dues", category: "dues" },
      });
      await budgetFetch(`/api/budgets/packages/${pkg._id}`, { method: "PATCH", json: { action: "dues_assigned", batchId: charged.batchId } });
      onDone(`Assigned ${money(cents)} dues to ${charged.charges.length} members.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">Dues</p>
      <p className="text-sm text-muted-foreground">
        {money(need)} to raise ({money(pkg.totalCents)} budget, less {money(pkg.expectedIncomeCents)} income and {money(pkg.carryoverCents)} carried over) across {pkg.activeCount} actives. Suggested {money(pkg.suggestedDuesCents)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-[10rem_12rem_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor={`dues-${pkg._id}`}>Per active</Label>
          <CurrencyInput id={`dues-${pkg._id}`} step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Due</Label>
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
        </div>
        <Button onClick={() => void assign()} disabled={busy || cents === null || cents <= 0 || !dueDate}>{busy ? "Assigning…" : "Assign to all actives"}</Button>
      </div>
      {cents !== null && cents <= 0 ? <FieldError>Dues must be more than $0</FieldError> : null}
      {coverage !== null ? (
        <p className={coverage < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {coverage < 0 ? `${money(-coverage)} short of the budget.` : `Covers the budget with ${money(coverage)} to spare.`}
        </p>
      ) : null}
    </div>
  );
}

function BuildDialog({
  kind,
  term,
  committees,
  budgets,
  onClose,
  onDone,
}: {
  kind: "term" | "single" | "amendment";
  term: string;
  committees: { _id: string; name: string; status: string }[];
  budgets: Budget[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const choices = kind === "amendment" ? budgets.filter((b) => b.status === "open").map((b) => ({ _id: b.committee._id, name: b.committee.name })) : committees.filter((c) => c.status === "submitted");
  const [committeeId, setCommitteeId] = useState(choices[0]?._id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await budgetFetch("/api/budgets/packages", {
        method: "POST",
        json: { term, kind, committeeId: kind === "term" ? undefined : committeeId, amountCents: kind === "amendment" ? toCents(amount) : undefined, reason, title: title.trim() || undefined },
      });
      onDone("Package ready.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const heading = kind === "term" ? `Build the ${term} package` : kind === "single" ? "Vote on one committee" : "Propose an amendment";
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {kind === "term" ? "Every submitted proposal, frozen as it is now." : kind === "single" ? "Only this committee's submitted proposal goes to the vote." : "More money for one committee, by chapter vote."}
          </DialogDescription>
        </DialogHeader>
        <form id="build-form" onSubmit={submit} className="space-y-4">
          {kind !== "term" && !choices.length ? (
            <FieldError>{kind === "single" ? "No committee has a submitted proposal." : "No committee has an open budget."}</FieldError>
          ) : null}
          {kind !== "term" ? (
            <div className="space-y-2">
              <Label>Committee</Label>
              <Select value={committeeId} onValueChange={setCommitteeId}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>{choices.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}
          {kind === "amendment" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="amend-amount">Amount</Label>
                <CurrencyInput id="amend-amount" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {amount && (toCents(amount) ?? 0) <= 0 ? <FieldError>Must be more than $0</FieldError> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amend-reason">What it's for</Label>
                <Input id="amend-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </div>
            </>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="pkg-title">Title (optional)</Label>
            <Input id="pkg-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="build-form" disabled={saving || (kind !== "term" && !committeeId) || (kind === "amendment" && (!toCents(amount) || !reason.trim()))}>
            {saving ? "Building…" : "Build"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordDialog({ pkg, onClose, onDone }: { pkg: Pkg; onClose: () => void; onDone: (m: string) => void }) {
  const [yes, setYes] = useState("");
  const [no, setNo] = useState("");
  const [abstain, setAbstain] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = [yes, no, abstain].map((v) => (v.trim() === "" ? 0 : Number(v)));
  const countProblem = counts.some((n) => !Number.isInteger(n) || n < 0)
    ? "Counts must be whole numbers, zero or more"
    : counts.every((n) => n === 0)
      ? "Enter the vote count"
      : null;
  const passes = counts[0] > counts[1];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (countProblem) return;
    setSaving(true);
    setError(null);
    try {
      const data = await budgetFetch<{ package: Pkg }>(`/api/budgets/packages/${pkg._id}`, {
        method: "PATCH",
        json: { action: "record", yes: Number(yes || 0), no: Number(no || 0), abstain: Number(abstain || 0), date, note },
      });
      onDone(data.package.status === "approved" ? "Approved. Budgets are live." : "Recorded as not approved.");
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
          <DialogTitle>Record the vote</DialogTitle>
          <DialogDescription>For "{pkg.title}". Passes when yes beats no.</DialogDescription>
        </DialogHeader>
        <form id="record-form" onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[["Yes", yes, setYes], ["No", no, setNo], ["Abstain", abstain, setAbstain]].map(([label, value, set]: any) => (
              <div key={label} className="space-y-2">
                <Label htmlFor={`vote-${label}`}>{label}</Label>
                <Input id={`vote-${label}`} type="number" min="0" inputMode="numeric" value={value} onChange={(e) => set(e.target.value)} />
              </div>
            ))}
          </div>
          {countProblem ? <FieldError>{countProblem}</FieldError> : (
            <p className="text-sm text-muted-foreground">{passes ? "This passes. Budgets go live when you save." : "This doesn't pass. Proposals stay submitted for another round."}</p>
          )}
          <div className="space-y-2">
            <Label>Voted on</Label>
            <DatePicker value={date} onChange={setDate} maxDate={new Date()} placeholder="Day of the vote" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vote-note">Note</Label>
            <Input id="vote-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          {error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="record-form" disabled={saving || Boolean(countProblem)}>{saving ? "Saving…" : "Save result"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
