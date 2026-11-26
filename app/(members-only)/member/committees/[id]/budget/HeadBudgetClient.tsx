"use client";

// A committee's money, for its head (and the treasury looking over their
// shoulder): this term's proposal, the live budget once it's approved, the
// head's requests, money movements, and the committee's action log.
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowLeftRight, ClipboardList, FileText, History, Layers, Receipt, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "../../../../components/shell/PageShell";
import { EmptyState, ErrorState } from "../../../../components/shell/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { budgetFetch, dateTime, money, PROPOSAL_STATUS, type Budget, type BudgetRequest, type Proposal, type TermState } from "../../../../components/budget/api";
import { BudgetLines, BudgetSummary } from "../../../../components/budget/BudgetBars";
import { ProposalEditor, ProposalView } from "../../../../components/budget/ProposalEditor";
import { RequestDialog } from "../../../../components/budget/RequestDialog";
import { RequestRow } from "../../../../components/budget/RequestRow";
import { ActivityLog } from "../../../../components/budget/ActivityLog";
import { BudgetPageSkeleton, FieldError, Panel } from "../../../../components/budget/ui";

interface Entry {
  _id: string;
  kind: string;
  amountCents: number;
  note: string;
  lineId: string | null;
  from: { budgetId: string | null; lineId: string | null } | null;
  to: { budgetId: string | null; lineId: string | null } | null;
  occurredAt: string;
  reversed: boolean;
  reversesEntryId: string | null;
}

interface Payload {
  term: TermState;
  committee: { _id: string; name: string };
  viewer: { isHead: boolean; isTreasury: boolean };
  proposal: Proposal;
  budget: Budget | null;
  entries: Entry[];
  requests: BudgetRequest[];
  budgetTerms: string[];
}

const KIND_LABEL: Record<string, string> = {
  allocation: "Added",
  adjustment: "Adjusted",
  income: "Income",
  direct_spend: "Chapter spending",
  transfer: "Moved",
  rollover: "Carried over",
  reversal: "Reversal",
};

export default function HeadBudgetClient({ committeeId }: { committeeId: string }) {
  const [term, setTerm] = React.useState<string | null>(null);
  const [terms, setTerms] = React.useState<string[]>([]);
  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | { kind: "claim" | "preapproval"; existing?: BudgetRequest; preapproval?: BudgetRequest }>(null);
  const [reversing, setReversing] = React.useState<Entry | null>(null);
  const [logKey, setLogKey] = React.useState(0);
  const [tab, setTab] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState(false);

  const load = React.useCallback(async (which: string | null) => {
    try {
      const q = which ? `?term=${encodeURIComponent(which)}` : "";
      const [payload, termList] = await Promise.all([
        budgetFetch<Payload>(`/api/budgets/committee/${committeeId}${q}`),
        budgetFetch<{ current: string; terms: { term: string }[] }>(`/api/budgets/terms`),
      ]);
      setData(payload);
      setTerm(payload.term.term);
      setTerms([...new Set([termList.current, ...termList.terms.map((t) => t.term), ...payload.budgetTerms])]);
      setTab((t) => t ?? (payload.budget ? "budget" : "proposal"));
      setError(null);
      setLogKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSwitching(false);
    }
  }, [committeeId]);

  React.useEffect(() => {
    void load(null);
  }, [load]);

  if (error && !data) {
    return (
      <PageContainer>
        <ErrorState description={error} action={<Button variant="outline" onClick={() => void load(term)}>Try again</Button>} />
      </PageContainer>
    );
  }
  if (!data || !term || !tab) {
    return (
      <PageContainer>
        <BudgetPageSkeleton />
      </PageContainer>
    );
  }

  const { budget, proposal, viewer } = data;
  const canFile = viewer.isHead && budget?.status === "open";
  const canPropose = viewer.isHead && data.term.proposalsOpen && ["not_started", "draft", "returned", "submitted"].includes(proposal.status);
  const status = PROPOSAL_STATUS[proposal.status] ?? PROPOSAL_STATUS.draft;
  const waiting = data.requests.filter((r) => r.status === "pending").length;
  const saved = (message: string) => {
    toast.success(message);
    setDialog(null);
    void load(term);
  };

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`/member/committees/${committeeId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground">
            <ArrowLeft className="size-4" /> {data.committee.name}
          </Link>
        }
        title={`${data.committee.name} budget`}
        description={
          budget
            ? budget.status === "closed" ? `${term} is closed.` : `${term}. ${money(budget.totals.availableCents)} free to spend.`
            : `${term}. Proposal: ${status.label.toLowerCase()}.`
        }
        actions={
          <>
            <Select value={term} onValueChange={(t) => { setEditing(false); setSwitching(true); setTab(null); void load(t); }}>
              <SelectTrigger className="w-40" aria-label="Term"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {canFile ? (
              <>
                <Button variant="outline" onClick={() => setDialog({ kind: "preapproval" })}><Wallet className="size-4" /> Request money</Button>
                <Button onClick={() => setDialog({ kind: "claim" })}><Receipt className="size-4" /> Submit receipt</Button>
              </>
            ) : null}
          </>
        }
      />

      {switching ? null : budget ? <BudgetSummary budget={budget} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="requests">
            Requests{waiting ? <Badge variant="warning" className="ml-2">{waiting}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="budget" className="mt-6 space-y-6">
          {!budget ? (
            <EmptyState
              title={`No ${term} budget yet`}
              description={proposal.status === "approved" ? "Approved. It will appear here shortly." : "It starts once the chapter approves your proposal."}
              icon={<Wallet aria-hidden="true" />}
              action={canPropose ? <Button onClick={() => { setTab("proposal"); setEditing(true); }}>{proposal.status === "not_started" ? "Start your proposal" : "Open your proposal"}</Button> : undefined}
            />
          ) : (
            <>
              <Panel icon={<Layers aria-hidden="true" />} title="Lines" description="Where the money is set aside." flush>
                <BudgetLines budget={budget} />
              </Panel>
              {viewer.isTreasury ? (
                <Panel icon={<ArrowLeftRight aria-hidden="true" />} title="Money movements" description="Everything put in, taken out or moved. Reversing keeps the original on record." flush>
                  {data.entries.some((e) => e.kind !== "reversal") ? (
                    <ul className="divide-y divide-border p-0">
                      {data.entries.filter((e) => e.kind !== "reversal").map((e) => {
                        const out = e.kind === "direct_spend" || (e.from?.budgetId === budget._id && e.to?.budgetId !== budget._id) || (e.kind === "adjustment" && e.amountCents < 0);
                        return (
                          <li key={e._id} className="flex list-none items-center justify-between gap-4 px-6 py-3">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                                {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {dateTime(e.occurredAt)}
                                {e.reversed ? " · reversed" : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className={e.reversed ? "text-sm tabular-nums text-muted-foreground line-through" : out ? "text-sm tabular-nums text-foreground" : "text-sm tabular-nums text-emerald-600 dark:text-emerald-400"}>
                                {out ? "−" : "+"}{money(Math.abs(e.amountCents))}
                              </span>
                              {budget.status === "open" && !e.reversed && !["reversal", "rollover"].includes(e.kind) ? (
                                <Button size="icon" variant="ghost" aria-label="Reverse this entry" onClick={() => setReversing(e)}>
                                  <Undo2 aria-hidden="true" />
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground">No money movements yet.</p>
                  )}
                </Panel>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          <Panel
            icon={<ClipboardList aria-hidden="true" />}
            title="Requests"
            description="Receipts you've submitted and money you've asked for."
            flush
            actions={canFile ? <Button size="sm" onClick={() => setDialog({ kind: "claim" })}><Receipt className="size-4" /> Submit receipt</Button> : undefined}
          >
            {data.requests.length ? (
              <ul className="divide-y divide-border p-0">
                {data.requests.map((r) => (
                  <li key={r._id} className="list-none">
                    <RequestRow
                      request={r}
                      actions={viewer.isHead && budget?.status === "open" ? <HeadActions request={r} onEdit={() => setDialog({ kind: r.kind, existing: r })} onClaim={() => setDialog({ kind: "claim", preapproval: r })} onDone={saved} /> : null}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">{budget ? "No requests yet." : "Requests open once there's a budget."}</p>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="proposal" className="mt-6">
          <Panel
            icon={<FileText aria-hidden="true" />}
            title={`${term} proposal`}
            description="What your committee asked the chapter for."
            actions={
              canPropose && !editing && proposal.status !== "not_started" ? (
                <Button size="sm" variant={proposal.status === "returned" ? "default" : "outline"} onClick={() => setEditing(true)}>
                  {proposal.status === "returned" ? "Revise" : "Edit"}
                </Button>
              ) : undefined
            }
          >
            {!data.term.exists && proposal.status === "not_started" ? (
              <p className="text-sm text-muted-foreground">{term} proposals haven&apos;t opened yet.</p>
            ) : editing || (canPropose && proposal.status === "not_started") ? (
              <ProposalEditor
                proposal={proposal}
                term={term}
                committeeParam={committeeId}
                mode="owner"
                onCancel={proposal.status === "not_started" ? undefined : () => setEditing(false)}
                onSaved={(_, message) => { toast.success(message); setEditing(false); void load(term); }}
              />
            ) : (
              <>
                <ProposalView proposal={proposal} />
                {viewer.isHead && !data.term.proposalsOpen && !["approved", "not_started"].includes(proposal.status) ? (
                  <p className="mt-4 text-sm text-muted-foreground">Proposals are closed for {term}.</p>
                ) : null}
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Panel icon={<History aria-hidden="true" />} title="Activity" description="Every change to this committee's money, newest first." flush>
            <ActivityLog committeeId={committeeId} term={term} refreshKey={logKey} />
          </Panel>
        </TabsContent>
      </Tabs>

      {dialog && budget ? (
        <RequestDialog budget={budget} kind={dialog.kind} existing={dialog.existing} preapproval={dialog.preapproval} onClose={() => setDialog(null)} onSaved={saved} />
      ) : null}
      {reversing ? <ReverseDialog entry={reversing} onClose={() => setReversing(null)} onDone={(m) => { setReversing(null); toast.success(m); void load(term); }} /> : null}
    </PageContainer>
  );
}

function ReverseDialog({ entry, onClose, onDone }: { entry: Entry; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!note.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await budgetFetch(`/api/budgets/entries/${entry._id}`, { method: "POST", json: { note: note.trim() } });
      onDone("Reversed.");
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
          <DialogTitle>Reverse {money(Math.abs(entry.amountCents))}</DialogTitle>
          <DialogDescription>{KIND_LABEL[entry.kind] ?? entry.kind}{entry.note ? `: ${entry.note}` : ""}. The original stays on record.</DialogDescription>
        </DialogHeader>
        <form id="reverse-form" onSubmit={submit} className="space-y-2">
          <Label htmlFor="reverse-note">Why</Label>
          <Input id="reverse-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <FieldError>{error}</FieldError>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="reverse-form" variant="destructive" disabled={saving || !note.trim()}>{saving ? "Reversing…" : "Reverse"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeadActions({ request, onEdit, onClaim, onDone }: { request: BudgetRequest; onEdit: () => void; onClaim: () => void; onDone: (m: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  async function act(action: "withdraw" | "release", message: string) {
    setBusy(true);
    try {
      await budgetFetch(`/api/budgets/requests/${request._id}`, { method: "PATCH", json: { action } });
      onDone(message);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (request.status === "returned") {
    return <Button size="sm" onClick={onEdit}>Fix and resubmit</Button>;
  }
  if (request.status === "pending") {
    return (
      <>
        <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => void act("withdraw", "Withdrawn.")} disabled={busy}>Withdraw</Button>
      </>
    );
  }
  if (request.kind === "preapproval" && request.status === "approved") {
    return (
      <>
        <Button size="sm" onClick={onClaim} disabled={busy}>File receipt</Button>
        <Button size="sm" variant="ghost" onClick={() => void act("release", "Hold released.")} disabled={busy}>Don&apos;t need it</Button>
      </>
    );
  }
  return null;
}
