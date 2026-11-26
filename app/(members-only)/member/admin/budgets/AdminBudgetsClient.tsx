"use client";

// The treasurer's committee budget console: setting the term up, reviewing
// proposals, the vote and dues, live budgets and their money tools, the
// request queue, the full action log, and closing the term.
import * as React from "react";
import Link from "next/link";
import { ClipboardList, Download, FileText, History, Lock, MoreHorizontal, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { EmptyState, ErrorState } from "../../../components/shell/States";
import { BudgetCardsSkeleton, BudgetPageSkeleton, FieldError, IconPill, Panel, RowsSkeleton, StatTiles } from "../../../components/budget/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { budgetFetch, dollarsInput, money, PROPOSAL_STATUS, shortDate, toCents, type Budget, type BudgetRequest, type Proposal, type TermState } from "../../../components/budget/api";
import { UsageBar } from "../../../components/budget/BudgetBars";
import { ProposalEditor, ProposalView } from "../../../components/budget/ProposalEditor";
import { RequestRow } from "../../../components/budget/RequestRow";
import { ActivityLog } from "../../../components/budget/ActivityLog";
import { MoneyDialog, type MoneyKind } from "./MoneyDialog";
import { LinesDialog } from "./LinesDialog";
import { PayDialog, RetagDialog, ReviewDialog } from "./RequestDialogs";
import { PackagesTab } from "./PackagesTab";

interface ProposalRow {
  committee: { _id: string; name: string; color: string | null; headName: string } | null;
  proposal: Proposal;
}

export default function AdminBudgetsClient() {
  const [term, setTerm] = React.useState<string | null>(null);
  const [terms, setTerms] = React.useState<string[]>([]);
  const [termState, setTermState] = React.useState<TermState | null>(null);
  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [counts, setCounts] = React.useState({ pending: 0, unpaid: 0 });
  const [proposals, setProposals] = React.useState<{ rows: ProposalRow[]; totalCents: number; expectedIncomeCents: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("budgets");
  const [logKey, setLogKey] = React.useState(0);

  const load = React.useCallback(async (which?: string | null) => {
    try {
      const t = await budgetFetch<{ current: string; term: TermState; terms: { term: string }[] }>(`/api/budgets/terms${which ? `?term=${encodeURIComponent(which)}` : ""}`);
      const active = t.term.term;
      const [b, p] = await Promise.all([
        budgetFetch<{ budgets: Budget[]; counts: { pending: number; unpaid: number } }>(`/api/budgets?term=${encodeURIComponent(active)}`),
        budgetFetch<{ rows: ProposalRow[]; totalCents: number; expectedIncomeCents: number }>(`/api/budgets/proposals?term=${encodeURIComponent(active)}`),
      ]);
      setTerm(active);
      setTermState(t.term);
      setTerms([...new Set([t.current, active, ...t.terms.map((x) => x.term)])]);
      setBudgets(b.budgets);
      setCounts(b.counts);
      setProposals(p);
      setLogKey((k) => k + 1);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  React.useEffect(() => {
    void load(null);
  }, [load]);

  const reload = React.useCallback(() => void load(term), [load, term]);

  async function windowAction(action: "open" | "close" | "reopen") {
    try {
      await budgetFetch("/api/budgets/terms", { method: "POST", json: { term, action } });
      toast.success(action === "open" ? `${term} proposals are open.` : action === "close" ? "Proposals closed." : "Proposals reopened.");
      reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (error && !termState) {
    return (
      <PageContainer className="max-w-7xl">
        <ErrorState description={error} action={<Button variant="outline" onClick={() => void load(term)}>Try again</Button>} />
      </PageContainer>
    );
  }
  if (!term || !termState || !proposals) {
    return (
      <PageContainer className="max-w-7xl">
        <BudgetPageSkeleton tiles={5} cards />
      </PageContainer>
    );
  }

  const totals = budgets.reduce(
    (t, b) => ({
      funded: t.funded + b.totals.fundedCents,
      spent: t.spent + b.totals.spentCents,
      held: t.held + b.totals.heldCents,
      available: t.available + b.totals.availableCents,
    }),
    { funded: 0, spent: 0, held: 0, available: 0 }
  );

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Committee budgets"
        description={!termState.exists ? `${term} hasn't been opened yet.` : termState.proposalsOpen ? `${term}. Heads can submit proposals.` : `${term}. Proposals are closed.`}
        actions={
          <>
            <Select value={term} onValueChange={(t) => void load(t)}>
              <SelectTrigger className="w-40" aria-label="Term"><SelectValue /></SelectTrigger>
              <SelectContent>{terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            {!termState.exists ? (
              <Button onClick={() => void windowAction("open")}><FileText className="size-4" /> Open {term} proposals</Button>
            ) : termState.proposalsOpen ? (
              <Button variant="outline" onClick={() => void windowAction("close")}>Close proposals</Button>
            ) : (
              <Button variant="outline" onClick={() => void windowAction("reopen")}>Reopen proposals</Button>
            )}
            <Button asChild variant="outline">
              <a href={`/api/budgets/export?term=${encodeURIComponent(term)}`}><Download className="size-4" /> CSV</a>
            </Button>
          </>
        }
      />

      <StatTiles
        tiles={[
          { label: "Budgeted", value: money(totals.funded), hint: `${budgets.length} committee${budgets.length === 1 ? "" : "s"}` },
          { label: "Spent", value: money(totals.spent) },
          { label: "Held", value: money(totals.held) },
          { label: "Free", value: money(totals.available), danger: totals.available < 0 },
          { label: "Waiting on you", value: counts.pending + counts.unpaid, hint: `${counts.pending} to review, ${counts.unpaid} to pay`, danger: counts.pending + counts.unpaid > 0 },
        ]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="vote">Vote and dues</TabsTrigger>
            <TabsTrigger value="requests">
              Requests{counts.pending ? <Badge variant="warning" className="ml-2">{counts.pending}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="close">Close term</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="budgets" className="mt-6">
          <BudgetsTab budgets={budgets} onChanged={reload} />
        </TabsContent>
        <TabsContent value="proposals" className="mt-6">
          <ProposalsTab term={term} data={proposals} onChanged={reload} />
        </TabsContent>
        <TabsContent value="vote" className="mt-6">
          <PackagesTab
            term={term}
            committees={proposals.rows.filter((r) => r.committee).map((r) => ({ _id: r.committee!._id, name: r.committee!.name, status: r.proposal.status }))}
            budgets={budgets}
            onChanged={reload}
          />
        </TabsContent>
        <TabsContent value="requests" className="mt-6">
          <RequestsTab term={term} budgets={budgets} counts={counts} onChanged={reload} />
        </TabsContent>
        <TabsContent value="activity" className="mt-6">
          <Panel
            icon={<History aria-hidden="true" />}
            title="Activity"
            description={`Every budget action in ${term}, by everyone.`}
            flush
            actions={<Button asChild size="sm" variant="outline"><a href={`/api/budgets/export?term=${encodeURIComponent(term)}`}><Download className="size-4" /> CSV</a></Button>}
          >
            <ActivityLog term={term} showCommittee refreshKey={logKey} />
          </Panel>
        </TabsContent>
        <TabsContent value="close" className="mt-6">
          <CloseTab term={term} onChanged={reload} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------

function BudgetsTab({ budgets, onChanged }: { budgets: Budget[]; onChanged: () => void }) {
  const [money_, setMoney] = React.useState<{ kind: MoneyKind; budget: Budget } | null>(null);
  const [lines, setLines] = React.useState<Budget | null>(null);
  if (!budgets.length) {
    return (
      <EmptyState
        icon={<PiggyBank aria-hidden="true" />}
        title="No live budgets yet"
        description="They're created when the chapter approves the package in Vote and dues."
      />
    );
  }
  return (
    <>
      <ul className="grid list-none gap-3 p-0 md:grid-cols-2">
        {budgets.map((b) => (
          <li key={b._id}>
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconPill><PiggyBank aria-hidden="true" /></IconPill>
                    <div className="min-w-0">
                      <Link href={`/member/committees/${b.committee._id}/budget`} className="font-semibold text-foreground no-underline hover:underline">{b.committee.name}</Link>
                      {b.status === "closed" ? <Badge variant="muted" className="ml-2">Closed</Badge> : null}
                      <p className={b.totals.availableCents < 0 ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
                        {money(b.totals.availableCents)} free{b.percentUsed !== null ? ` · ${b.percentUsed}% used` : ""}
                      </p>
                    </div>
                  </div>
                  {b.status === "open" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`${b.committee.name} actions`}><MoreHorizontal aria-hidden="true" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setMoney({ kind: "allocation", budget: b })}>Add money</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMoney({ kind: "adjustment", budget: b })}>Adjust total</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMoney({ kind: "transfer", budget: b })}>Move money</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMoney({ kind: "income", budget: b })}>Record income</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMoney({ kind: "direct_spend", budget: b })}>Record chapter spending</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setLines(b)}>Lines</DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/member/committees/${b.committee._id}/budget`}>Open committee view</Link></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <UsageBar totals={b.totals} />
                <ul className="space-y-1.5 border-t border-border p-0 pt-3 text-sm">
                  {b.lines.filter((l) => !l.archived).map((l) => (
                    <li key={l._id ?? "u"} className="flex list-none justify-between gap-2">
                      <span className="text-muted-foreground">{l.name}</span>
                      <span className={l.totals.availableCents < 0 ? "tabular-nums text-destructive" : "tabular-nums text-foreground"}>
                        {money(l.totals.availableCents)} of {money(l.totals.fundedCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {money_ ? (
        <MoneyDialog kind={money_.kind} budget={money_.budget} budgets={budgets} onClose={() => setMoney(null)} onDone={(m) => { toast.success(m); setMoney(null); onChanged(); }} />
      ) : null}
      {lines ? <LinesDialog budget={lines} onClose={() => { setLines(null); onChanged(); }} onChanged={() => {}} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function ProposalsTab({ term, data, onChanged }: { term: string; data: { rows: ProposalRow[]; totalCents: number; expectedIncomeCents: number }; onChanged: () => void }) {
  const [open, setOpen] = React.useState<ProposalRow | null>(null);
  const submitted = data.rows.filter((r) => r.proposal.status === "submitted").length;
  return (
    <>
      <Panel
        icon={<FileText aria-hidden="true" />}
        title="Proposals"
        description={`${money(data.totalCents)} asked for, ${money(data.expectedIncomeCents)} expected income. ${submitted} waiting on review.`}
        flush
      >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Committee</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => {
              const s = PROPOSAL_STATUS[r.proposal.status] ?? PROPOSAL_STATUS.draft;
              return (
                <tr key={r.committee?._id ?? "chapter"}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-foreground">{r.committee?.name ?? "Chapter costs"}</p>
                    <p className="text-xs text-muted-foreground">{r.committee ? r.committee.headName || "No head" : "Nationals, insurance, reserve"}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{money(r.proposal.totalCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{shortDate(r.proposal.updatedAt)}</td>
                  <td className="px-6 py-3 text-right">
                    <Button size="sm" variant={r.proposal.status === "submitted" ? "default" : "outline"} onClick={() => setOpen(r)} disabled={r.committee !== null && r.proposal.status === "not_started"}>
                      {r.committee ? (r.proposal.status === "submitted" ? "Review" : "View") : ["approved", "rejected"].includes(r.proposal.status) ? "View" : "Edit"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Panel>
      {open ? <ProposalDialog term={term} row={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); onChanged(); }} /> : null}
    </>
  );
}

function ProposalDialog({ term, row, onClose, onChanged }: { term: string; row: ProposalRow; onClose: () => void; onChanged: () => void }) {
  const isChapter = !row.committee;
  const locked = ["approved", "rejected"].includes(row.proposal.status);
  const [mode, setMode] = React.useState<"view" | "edit" | "return">(isChapter && !locked ? "edit" : "view");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const param = row.committee?._id ?? "chapter";
  const canReview = !isChapter && (row.proposal.status === "submitted" || row.proposal.status === "returned");

  async function sendBack() {
    setBusy(true);
    try {
      await budgetFetch(`/api/budgets/proposals/${param}`, { method: "PATCH", json: { term, action: "return", note } });
      toast.success("Sent back.");
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{row.committee?.name ?? "Chapter costs"}</DialogTitle>
          <DialogDescription>{term} proposal</DialogDescription>
        </DialogHeader>
        {mode === "edit" ? (
          <ProposalEditor
            proposal={row.proposal}
            term={term}
            committeeParam={param}
            mode={isChapter ? "owner" : "treasurer"}
            onCancel={isChapter ? undefined : () => setMode("view")}
            onSaved={(_, m) => { toast.success(m); onChanged(); }}
          />
        ) : (
          <>
            <ProposalView proposal={row.proposal} />
            {mode === "return" ? (
              <div className="space-y-2">
                <Textarea aria-label="What should change" placeholder="What should change" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setMode("view")} disabled={busy}>Cancel</Button>
                  <Button onClick={() => void sendBack()} disabled={busy || !note.trim()}>Send back</Button>
                </div>
              </div>
            ) : canReview ? (
              <div className="flex justify-end gap-2">
                {row.proposal.status === "submitted" ? <Button variant="outline" onClick={() => setMode("return")}>Send back</Button> : null}
                <Button variant="outline" onClick={() => setMode("edit")}>Edit numbers</Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function RequestsTab({ term, budgets, counts, onChanged }: { term: string; budgets: Budget[]; counts: { pending: number; unpaid: number }; onChanged: () => void }) {
  const [view, setView] = React.useState<"review" | "unpaid" | "all">("review");
  const [rows, setRows] = React.useState<BudgetRequest[] | null>(null);
  const [dialog, setDialog] = React.useState<null | { type: "review" | "pay" | "retag" | "release"; request: BudgetRequest }>(null);

  const load = React.useCallback(async () => {
    const q = new URLSearchParams({ term });
    if (view !== "all") q.set("queue", view);
    else q.set("status", "all");
    try {
      setRows((await budgetFetch<{ requests: BudgetRequest[] }>(`/api/budgets/requests?${q}`)).requests);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [term, view]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const done = (m: string) => {
    toast.success(m);
    setDialog(null);
    void load();
    onChanged();
  };

  async function release(r: BudgetRequest) {
    try {
      await budgetFetch(`/api/budgets/requests/${r._id}`, { method: "PATCH", json: { action: "release" } });
      done("Hold released.");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        icon={<ClipboardList aria-hidden="true" />}
        title="Requests"
        description="Claims and spending requests from committee heads."
        flush
        actions={
          <Tabs value={view} onValueChange={(v) => { setRows(null); setView(v as any); }}>
            <TabsList>
              <TabsTrigger value="review">To review{counts.pending ? ` (${counts.pending})` : ""}</TabsTrigger>
              <TabsTrigger value="unpaid">To pay{counts.unpaid ? ` (${counts.unpaid})` : ""}</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
      {rows === null ? (
        <RowsSkeleton rows={3} label="Loading requests…" />
      ) : !rows.length ? (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">{view === "review" ? "Nothing waiting on you." : view === "unpaid" ? "Everything approved is paid." : "No requests this term."}</p>
      ) : (
        <ul className="divide-y divide-border p-0">
          {rows.map((r) => (
            <li key={r._id} className="list-none">
              <RequestRow
                request={r}
                showCommittee
                actions={
                  <>
                    {r.status === "pending" ? <Button size="sm" onClick={() => setDialog({ type: "review", request: r })}>Review</Button> : null}
                    {r.status === "approved" && r.kind === "claim" && r.payout.status === "unpaid" ? <Button size="sm" onClick={() => setDialog({ type: "pay", request: r })}>Pay</Button> : null}
                    {r.status === "approved" && r.kind === "preapproval" ? <Button size="sm" variant="outline" onClick={() => void release(r)}>Release hold</Button> : null}
                    {["pending", "approved", "returned"].includes(r.status) && !r.preapprovalId ? (
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ type: "retag", request: r })}>Move</Button>
                    ) : null}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      </Panel>
      {dialog?.type === "review" ? (
        <ReviewDialog request={dialog.request} budget={budgets.find((b) => b._id === dialog.request.budgetId)} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog?.type === "pay" ? <PayDialog request={dialog.request} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.type === "retag" ? <RetagDialog request={dialog.request} budgets={budgets} onClose={() => setDialog(null)} onDone={done} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface CloseRow {
  budgetId: string;
  committeeId: string;
  committeeName: string;
  status: string;
  leftoverCents: number;
  pendingCount: number;
  heldCents: number;
  unpaidCount: number;
}

function CloseTab({ term, onChanged }: { term: string; onChanged: () => void }) {
  const [data, setData] = React.useState<{ nextTerm: string; rows: CloseRow[] } | null>(null);
  const [carry, setCarry] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const d = await budgetFetch<{ nextTerm: string; rows: CloseRow[] }>(`/api/budgets/close?term=${encodeURIComponent(term)}`);
      setData(d);
      setCarry(Object.fromEntries(d.rows.map((r) => [r.budgetId, dollarsInput(r.leftoverCents)])));
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [term]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function close(row: CloseRow) {
    setBusy(row.budgetId);
    try {
      const cents = Math.min(toCents(carry[row.budgetId] ?? "") ?? 0, row.leftoverCents);
      const result = await budgetFetch<{ carriedCents?: number; returnedCents?: number }>("/api/budgets/close", { method: "POST", json: { budgetId: row.budgetId, carryCents: cents } });
      toast.success(`${row.committeeName} closed. ${money(result.carriedCents ?? 0)} carried, ${money(result.returnedCents ?? 0)} returned.`);
      await load();
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const carryProblem = (r: CloseRow) => {
    const raw = carry[r.budgetId] ?? "";
    if (!raw.trim()) return null;
    const cents = toCents(raw);
    if (cents === null || cents < 0) return "Must be $0 or more";
    if (cents > r.leftoverCents) return `Only ${money(r.leftoverCents)} is left to carry`;
    return null;
  };

  return (
    <Panel
      icon={<Lock aria-hidden="true" />}
      title={`Close ${term}`}
      description={data ? `Leftover money carries into ${data.nextTerm} or goes back to the chapter. Unused holds are released.` : "Loading…"}
      flush
    >
      {!data ? (
        <RowsSkeleton rows={3} label="Loading budgets…" />
      ) : !data.rows.length ? (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">No budgets to close for {term}.</p>
      ) : (
      <ul className="divide-y divide-border p-0">
        {data.rows.map((r) => (
          <li key={r.budgetId} className="list-none">
            <div>
              <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{r.committeeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.status === "closed"
                      ? "Closed"
                      : `${money(r.leftoverCents)} left${r.heldCents ? ` (incl. ${money(r.heldCents)} held)` : ""}${r.pendingCount ? `, ${r.pendingCount} to review first` : ""}${r.unpaidCount ? `, ${r.unpaidCount} still to pay` : ""}`}
                  </p>
                </div>
                {r.status === "open" ? (
                  <div className="flex items-end gap-2">
                    <div className="w-36 space-y-1">
                      <label className="text-xs text-muted-foreground" htmlFor={`carry-${r.budgetId}`}>Carry into {data.nextTerm}</label>
                      <CurrencyInput id={`carry-${r.budgetId}`} min="0" step="0.01" value={carry[r.budgetId] ?? ""} onChange={(e) => setCarry((c) => ({ ...c, [r.budgetId]: e.target.value }))} />
                    </div>
                    <Button onClick={() => void close(r)} disabled={Boolean(busy) || r.pendingCount > 0 || Boolean(carryProblem(r))}>{busy === r.budgetId ? "Closing…" : "Close"}</Button>
                  </div>
                ) : null}
              </div>
              {r.status === "open" && (carryProblem(r) || r.pendingCount > 0) ? (
                <div className="px-6 pb-4">
                  <FieldError>{carryProblem(r) ?? `Review the ${r.pendingCount} pending request${r.pendingCount === 1 ? "" : "s"} before closing`}</FieldError>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      )}
    </Panel>
  );
}
