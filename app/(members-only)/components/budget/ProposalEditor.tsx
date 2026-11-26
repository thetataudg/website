"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { budgetFetch, dateTime, dollarsInput, money, PROPOSAL_STATUS, toCents, type Proposal } from "./api";
import { FieldError } from "./ui";

interface DraftLine {
  key: string;
  _id?: string;
  name: string;
  amount: string;
  reason: string;
}

function toDraft(p: Proposal): DraftLine[] {
  return p.lines.map((l, i) => ({ key: l._id || `l${i}`, _id: l._id || undefined, name: l.name, amount: dollarsInput(l.amountCents), reason: l.reason }));
}

let seq = 0;

/// The proposal form. `mode` decides what saving means:
///   owner      the head (or the treasurer for chapter costs): save or submit
///   treasurer  edit a submitted proposal, with a reason the head will see
export function ProposalEditor({
  proposal,
  term,
  committeeParam,
  mode,
  onSaved,
  onCancel,
}: {
  proposal: Proposal;
  term: string;
  committeeParam: string;
  mode: "owner" | "treasurer";
  onSaved: (p: Proposal, message: string) => void;
  onCancel?: () => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>(() => (proposal.lines.length ? toDraft(proposal) : [{ key: `n${seq++}`, name: "", amount: "", reason: "" }]));
  const [income, setIncome] = useState(dollarsInput(proposal.expectedIncomeCents || null));
  const [note, setNote] = useState(proposal.note);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => lines.reduce((s, l) => s + (toCents(l.amount) ?? 0), 0), [lines]);

  // What the server would refuse, per line, shown as you type.
  const lineProblems = useMemo(() => {
    const seen = new Map<string, number>();
    lines.forEach((l) => {
      const k = l.name.trim().toLowerCase();
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    const out: Record<string, string> = {};
    for (const l of lines) {
      const name = l.name.trim();
      const cents = toCents(l.amount);
      if (!name && !l.amount.trim()) continue;
      if (!name) out[l.key] = "Name this line";
      else if (seen.get(name.toLowerCase())! > 1) out[l.key] = `"${name}" is listed twice`;
      else if (l.amount.trim() && (cents === null || cents < 0)) out[l.key] = "Amount must be $0 or more";
    }
    return out;
  }, [lines]);
  const incomeCents = toCents(income);
  const incomeProblem = income.trim() && (incomeCents === null || incomeCents < 0) ? "Must be $0 or more" : null;
  const blocked = Object.keys(lineProblems).length > 0 || Boolean(incomeProblem);
  const update = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save(intent: "save" | "submit") {
    setSaving(intent);
    setError(null);
    try {
      const payloadLines = lines
        .filter((l) => l.name.trim() || l.amount.trim())
        .map((l) => ({ _id: l._id, name: l.name.trim(), amountCents: toCents(l.amount) ?? 0, reason: l.reason.trim() }));
      const json: any = {
        term,
        lines: payloadLines,
        expectedIncomeCents: toCents(income) ?? 0,
        version: proposal.version || null,
      };
      let data: { proposal: Proposal };
      if (mode === "treasurer") {
        data = await budgetFetch(`/api/budgets/proposals/${committeeParam}`, { method: "PATCH", json: { ...json, action: "edit", reason } });
      } else {
        data = await budgetFetch(`/api/budgets/proposals/${committeeParam}`, { method: "PUT", json: { ...json, note, submit: intent === "submit" } });
      }
      onSaved(data.proposal, mode === "treasurer" ? "Changes saved. The head has been told." : intent === "submit" ? "Submitted to the treasurer." : "Draft saved.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="hidden grid-cols-[minmax(0,2fr)_8rem_minmax(0,3fr)_2.5rem] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Line</span>
          <span>Amount</span>
          <span>Why</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={l.key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,2fr)_8rem_minmax(0,3fr)_2.5rem] sm:border-0 sm:p-0">
            <Input aria-label={`Line ${i + 1} name`} placeholder="Food" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} maxLength={80} />
            <CurrencyInput aria-label={`Line ${i + 1} amount`} min="0" step="0.01" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />
            <Input aria-label={`Line ${i + 1} reason`} placeholder="Two socials" value={l.reason} onChange={(e) => update(l.key, { reason: e.target.value })} maxLength={500} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
              <Trash2 aria-hidden="true" />
            </Button>
            {lineProblems[l.key] ? <div className="sm:col-span-4"><FieldError>{lineProblems[l.key]}</FieldError></div> : null}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: `n${seq++}`, name: "", amount: "", reason: "" }])}>
          <Plus aria-hidden="true" /> Add line
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="proposal-income">Expected income</Label>
          <CurrencyInput id="proposal-income" min="0" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="0" />
          <FieldError>{incomeProblem}</FieldError>
        </div>
        <div className="flex items-end justify-end">
          <p className="text-right">
            <span className="block text-xs uppercase tracking-wide text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{money(total)}</span>
          </p>
        </div>
      </div>

      {mode === "owner" ? (
        <div className="space-y-2">
          <Label htmlFor="proposal-note">{committeeParam === "chapter" ? "Note" : "Note to the treasurer"}</Label>
          <Textarea id="proposal-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="proposal-reason">Why you're changing it</Label>
          <Textarea id="proposal-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </div>
      )}

      {error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? <Button variant="outline" onClick={onCancel} disabled={Boolean(saving)}>Cancel</Button> : null}
        {mode === "owner" ? (
          <>
            {proposal.status !== "submitted" ? (
              <Button variant="outline" onClick={() => void save("save")} disabled={Boolean(saving) || blocked}>
                {saving === "save" ? "Saving…" : "Save draft"}
              </Button>
            ) : null}
            <Button onClick={() => void save("submit")} disabled={Boolean(saving) || blocked || total <= 0}>
              {saving === "submit" ? "Submitting…" : proposal.status === "submitted" ? "Submit changes" : "Submit"}
            </Button>
          </>
        ) : (
          <Button onClick={() => void save("save")} disabled={Boolean(saving) || blocked || !reason.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
    </div>
  );
}

/// Read-only view with status and version history.
export function ProposalView({ proposal }: { proposal: Proposal }) {
  const status = PROPOSAL_STATUS[proposal.status] ?? PROPOSAL_STATUS.draft;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        {proposal.version > 0 ? <span className="text-sm text-muted-foreground">Version {proposal.version}</span> : null}
        {proposal.submittedAt ? <span className="text-sm text-muted-foreground">· submitted {dateTime(proposal.submittedAt)}{proposal.submittedBy ? ` by ${proposal.submittedBy}` : ""}</span> : null}
      </div>
      {proposal.reviewNote ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>Treasurer: {proposal.reviewNote}</AlertDescription>
        </Alert>
      ) : null}
      {proposal.lines.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {proposal.lines.map((l, i) => (
                <tr key={l._id || i}>
                  <td className="px-4 py-2 font-medium text-foreground">{l.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{l.reason}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">{money(l.amountCents)}</td>
                </tr>
              ))}
              <tr className="bg-muted/50">
                <td className="px-4 py-2 font-semibold text-foreground" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-foreground">{money(proposal.totalCents)}</td>
              </tr>
              {proposal.expectedIncomeCents ? (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground" colSpan={2}>Expected income</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money(proposal.expectedIncomeCents)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No lines yet.</p>
      )}
      {proposal.note ? <p className="text-sm text-muted-foreground">Note: {proposal.note}</p> : null}
      {proposal.history.length ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Earlier versions ({proposal.history.length})</summary>
          <ol className="mt-3 space-y-3 p-0">
            {proposal.history.map((h) => (
              <li key={h.version} className="list-none text-sm">
                <p className="font-medium text-foreground">
                  Version {h.version}, {money(h.totalCents)}
                </p>
                <p className="text-muted-foreground">
                  {h.action === "treasurer_edit" ? "Treasurer edit" : "Submitted"}
                  {h.editedBy ? ` by ${h.editedBy}` : ""}
                  {h.editedAt ? `, ${dateTime(h.editedAt)}` : ""}. Next version: {h.changeSummary}.
                </p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
