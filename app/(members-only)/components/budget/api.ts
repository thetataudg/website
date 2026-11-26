// Small client helpers shared by the head and treasurer budget pages.

export async function budgetFetch<T = any>(url: string, init?: RequestInit & { json?: any }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || "Something went wrong");
  return payload as T;
}

export function money(cents: number | null | undefined) {
  const value = Number(cents ?? 0);
  return (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(value) % 100 === 0 ? 0 : 2,
  });
}

/// "12.50" -> 1250. Null when it isn't a usable amount.
export function toCents(value: string): number | null {
  if (!value.trim()) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isFinite(n) ? n : null;
}

export function dollarsInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
}

export function todayYmd() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "muted";

export const PROPOSAL_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  not_started: { label: "Not started", variant: "muted" },
  draft: { label: "Draft", variant: "muted" },
  submitted: { label: "Submitted", variant: "secondary" },
  returned: { label: "Sent back", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export function requestStatus(r: { status: string; kind: string; payout?: { status: string | null } }): { label: string; variant: BadgeVariant } {
  if (r.status === "approved" && r.kind === "claim") {
    return r.payout?.status === "paid" ? { label: "Paid", variant: "success" } : { label: "Approved, unpaid", variant: "secondary" };
  }
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending: { label: "Waiting on treasurer", variant: "warning" },
    approved: { label: "Approved, held", variant: "secondary" },
    denied: { label: "Denied", variant: "destructive" },
    returned: { label: "Sent back", variant: "warning" },
    withdrawn: { label: "Withdrawn", variant: "muted" },
    fulfilled: { label: "Used", variant: "muted" },
    released: { label: "Released", variant: "muted" },
  };
  return map[r.status] ?? { label: r.status, variant: "muted" };
}

export interface Totals {
  fundedCents: number;
  spentCents: number;
  heldCents: number;
  pendingCents: number;
  availableCents: number;
}

export interface BudgetLine {
  _id: string | null;
  name: string;
  archived: boolean;
  totals: Totals;
}

export interface Budget {
  _id: string;
  term: string;
  status: string;
  committee: { _id: string; name: string; color: string | null };
  totals: Totals;
  percentUsed: number | null;
  lines: BudgetLine[];
}

export interface BudgetRequest {
  _id: string;
  kind: "claim" | "preapproval";
  committeeId: string;
  committeeName: string;
  budgetId: string | null;
  term: string;
  lineId: string | null;
  lineName: string;
  status: string;
  amountCents: number;
  approvedCents: number | null;
  description: string;
  category: string;
  purchasedOn: string | null;
  receiptUrls: string[];
  reviewNote: string;
  overBudgetOverride: boolean;
  preapprovalId: string | null;
  revision: number;
  submittedBy: { _id: string; name: string; rollNo: string } | null;
  payout: { status: string | null; method: string | null; reference: string; paidAt: string | null };
  submittedAt: string | null;
  ageDays: number;
}

export interface ProposalLine {
  _id?: string;
  name: string;
  amountCents: number;
  reason: string;
}

export interface Proposal {
  _id: string | null;
  term: string;
  committeeId: string | null;
  committeeName: string;
  status: string;
  version: number;
  lines: ProposalLine[];
  totalCents: number;
  expectedIncomeCents: number;
  note: string;
  reviewNote: string;
  submittedAt: string | null;
  submittedBy: string | null;
  updatedAt: string | null;
  history: {
    version: number;
    action: string;
    lines: ProposalLine[];
    totalCents: number;
    editedBy: string | null;
    editedAt: string | null;
    changeSummary: string;
  }[];
}

export interface TermState {
  term: string;
  exists: boolean;
  proposalsOpen: boolean;
}
