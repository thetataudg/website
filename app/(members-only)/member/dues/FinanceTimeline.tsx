"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  CircleCheck,
  CircleX,
  Coins,
  FileText,
  Receipt,
  RotateCw,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { LoadingSpinner } from "../../components/LoadingState";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SectionHeader } from "../../components/shell/PageShell";

export type TimelineEntry = {
  _id: string;
  type: string;
  summary: string;
  amountCents: number | null;
  occurredAt: string | null;
  actor: { rollNo: string; name: string } | null;
  channel: string;
};

export type FinanceStats = {
  timesRemindedThisTerm: number;
  averageDaysToPayCharge: number | null;
  installmentsMissed: number;
  lifetimePaidCents: number;
  creditHeldCents: number;
  medianVerificationDays: number | null;
  submissionsFiled: number;
  submissionsRejected: number;
  plansCompleted?: number;
  plansLive?: number;
  plansDefaulted?: number;
};

export type FinanceHistory = {
  member: { rollNo: string; name: string };
  term: string;
  stats: FinanceStats;
  timeline: TimelineEntry[];
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

function dayKey(iso: string | null) {
  if (!iso) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Phoenix",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const ICONS: Record<string, LucideIcon> = {
  charge_assigned: FileText,
  charge_amended: FileText,
  charge_waived: CircleCheck,
  charge_voided: CircleX,
  payment_submitted: Coins,
  payment_verified: CircleCheck,
  payment_rejected: CircleX,
  payment_recorded: Coins,
  payment_removed: CircleX,
  payment_online_succeeded: CircleCheck,
  payment_online_refunded: RotateCw,
  payment_online_disputed: TriangleAlert,
  plan_proposed: CalendarDays,
  plan_approved: CalendarDays,
  plan_denied: CircleX,
  plan_completed: CircleCheck,
  plan_defaulted: CircleX,
  plan_cancelled: CircleX,
  installment_missed: CircleX,
  installment_paid: CircleCheck,
  reimbursement_submitted: Receipt,
  reimbursement_approved: CircleCheck,
  reimbursement_denied: CircleX,
  credit_applied: RotateCw,
  credit_paid_out: Coins,
  reminder_sent: Bell,
};

/// Positive outcomes read green, refusals read as the destructive token. Colour
/// is never the only signal — each row carries its own icon and wording.
const POSITIVE = "text-emerald-700 dark:text-emerald-400";

const TONE: Record<string, string> = {
  payment_verified: POSITIVE,
  payment_online_succeeded: POSITIVE,
  charge_waived: POSITIVE,
  plan_approved: POSITIVE,
  plan_completed: POSITIVE,
  reimbursement_approved: POSITIVE,
  payment_rejected: "text-destructive",
  payment_online_refunded: "text-destructive",
  payment_online_disputed: "text-destructive",
  plan_denied: "text-destructive",
  plan_defaulted: "text-destructive",
  installment_missed: "text-destructive",
  reimbursement_denied: "text-destructive",
  charge_voided: "text-destructive",
  reminder_sent: "text-muted-foreground",
};

const EVENT_LABELS: Record<string, string> = {
  charge_assigned: "Charge",
  charge_amended: "Charge",
  charge_waived: "Charge",
  charge_voided: "Charge",
  payment_submitted: "Payment claim",
  payment_verified: "Payment",
  payment_rejected: "Payment claim",
  payment_recorded: "Payment",
  payment_removed: "Payment",
  payment_online_succeeded: "Online payment",
  payment_online_refunded: "Refund",
  payment_online_disputed: "Dispute",
  plan_proposed: "Payment plan",
  plan_approved: "Payment plan",
  plan_denied: "Payment plan",
  plan_completed: "Payment plan",
  plan_defaulted: "Payment plan",
  plan_cancelled: "Payment plan",
  installment_missed: "Installment",
  installment_paid: "Installment",
  reimbursement_submitted: "Reimbursement",
  reimbursement_approved: "Reimbursement",
  reimbursement_denied: "Reimbursement",
  credit_applied: "Credit",
  credit_paid_out: "Credit",
  reminder_sent: "Notification",
};

function displaySummary(entry: TimelineEntry) {
  const summary =
    entry.type === "reminder_sent"
      ? entry.summary.replace(/,\s*sent via\s+.+$/i, "")
      : entry.summary;
  return summary.replace(/\bpush\b/gi, "mobile notification");
}

function deliveryLabel(channel: string) {
  const names = channel
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item === "inapp") return "in-app";
      if (item === "push") return "mobile notification";
      return item;
    });
  return names.length ? `Delivered by ${names.join(", ")}` : "Recorded in the app";
}

/// The paper trail, on both surfaces.
///
/// Each line's wording was frozen when it happened, so a charge later amended
/// from $250 to $200 still reads $250 here — which is the entire reason for
/// keeping the log rather than deriving it.
export default function FinanceTimeline({
  endpoint,
  title = "History",
  bare = false,
}: {
  endpoint: string;
  title?: string;
  /** Drops the heading and outer margin for a sheet that carries its own. */
  bare?: boolean;
}) {
  const [data, setData] = useState<FinanceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't load the history");
      setData(payload);
    } catch (err: any) {
      setError(err.message || "Couldn't load the history");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="flex justify-center py-6"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <LoadingSpinner />
        <span className="sr-only">Loading history…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="warning" role="alert">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const { stats } = data;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTimeline = normalizedQuery
    ? data.timeline.filter((entry) => {
        const searchable = [
          displaySummary(entry),
          EVENT_LABELS[entry.type] ?? "Treasury activity",
          entry.actor?.name ?? "System",
          deliveryLabel(entry.channel),
          dayLabel(entry.occurredAt),
          entry.amountCents === null ? "" : money(entry.amountCents),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : data.timeline;
  const groupedTimeline = filteredTimeline.reduce<
    Array<{ key: string; label: string; entries: TimelineEntry[] }>
  >((groups, entry) => {
    const key = dayKey(entry.occurredAt);
    const current = groups.at(-1);
    if (current?.key === key) {
      current.entries.push(entry);
    } else {
      groups.push({
        key,
        label: dayLabel(entry.occurredAt) || "Date unavailable",
        entries: [entry],
      });
    }
    return groups;
  }, []);

  return (
    <section className={bare ? undefined : "mt-6"}>
      {bare ? null : <SectionHeader className="mb-3" title={title} as="h2" />}

      <Card className="mb-6 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
          <div className="space-y-1">
            <CardTitle className="text-base">At a glance</CardTitle>
            <CardDescription>Your overall treasury activity.</CardDescription>
          </div>
          <Badge variant="muted">{data.term}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-4">
          <Stat label="Paid to date" value={money(stats.lifetimePaidCents)} />
          <Stat
            label="Average time to pay"
            value={stats.averageDaysToPayCharge === null ? "—" : `${stats.averageDaysToPayCharge}d`}
          />
          <Stat label="Reminders this term" value={`${stats.timesRemindedThisTerm}`} />
          <Stat
            label="Installments missed"
            value={`${stats.installmentsMissed}`}
            tone={stats.installmentsMissed > 0 ? "text-destructive" : undefined}
          />
          {/* The paidOn/recordedAt split makes this free, and a queue running
              eight days behind is something the chapter should be able to see. */}
          <Stat
            label="Typical review wait"
            value={
              stats.medianVerificationDays === null
                ? "—"
                : `${stats.medianVerificationDays}d`
            }
            tone={
              (stats.medianVerificationDays ?? 0) >= 7
                ? "text-destructive"
                : undefined
            }
          />
          <Stat label="Credit held" value={money(stats.creditHeldCents)} />
          <Stat
            label="Claims filed"
            value={
              stats.submissionsRejected > 0
                ? `${stats.submissionsFiled} · ${stats.submissionsRejected} rejected`
                : `${stats.submissionsFiled}`
            }
            tone={stats.submissionsRejected > 0 ? "text-destructive" : undefined}
          />
          {(stats.plansCompleted ?? 0) +
            (stats.plansLive ?? 0) +
            (stats.plansDefaulted ?? 0) >
          0 ? (
            <Stat
              label="Payment plans"
              value={[
                (stats.plansLive ?? 0) > 0 ? `${stats.plansLive} live` : null,
                (stats.plansCompleted ?? 0) > 0 ? `${stats.plansCompleted} finished` : null,
                (stats.plansDefaulted ?? 0) > 0 ? `${stats.plansDefaulted} defaulted` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              tone={(stats.plansDefaulted ?? 0) > 0 ? "text-destructive" : undefined}
            />
          ) : (
            <Stat label="Payment plans" value="None" />
          )}
        </CardContent>
      </Card>

      {data.timeline.length > 0 ? (
        <div className="mb-6 space-y-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search finance history"
              placeholder="Search charges, payments, claims, or dates…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear history search"
                className="absolute right-0 top-0 size-10 text-muted-foreground"
                onClick={() => setQuery("")}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {normalizedQuery ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {filteredTimeline.length} result
              {filteredTimeline.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}

      {data.timeline.length === 0 ? (
        <Alert>
          <FileText aria-hidden="true" />
          <AlertDescription>Nothing has been recorded yet.</AlertDescription>
        </Alert>
      ) : filteredTimeline.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <Search aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">
              No history matches that search
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a member name, amount, event type, or date.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-7">
          {groupedTimeline.map((group) => (
            <section key={group.key} aria-labelledby={`finance-day-${group.key}`}>
              <div className="mb-4 flex items-center gap-3">
                <h3
                  id={`finance-day-${group.key}`}
                  className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.label}
                </h3>
                <Separator />
              </div>

              <ol className="relative mb-0 ms-4 list-none border-s border-border p-0">
                {group.entries.map((entry, index) => {
                  const Icon = ICONS[entry.type] ?? Coins;
                  const isLast = index === group.entries.length - 1;
                  return (
                    <li
                      key={entry._id}
                      className={cn("relative ms-7", !isLast && "pb-5")}
                    >
                      <span
                        className={cn(
                          "absolute -start-[2.625rem] top-0 flex size-7 items-center justify-center rounded-full border border-border bg-background",
                          TONE[entry.type] ?? "text-muted-foreground"
                        )}
                      >
                        <Icon aria-hidden="true" className="size-3.5" />
                      </span>

                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium leading-5 text-foreground">
                          {displaySummary(entry)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{EVENT_LABELS[entry.type] ?? "Treasury activity"}</span>
                          <span aria-hidden="true">·</span>
                          {/* "System" is the nightly job, not a person. */}
                          <span>{entry.actor ? entry.actor.name : "System"}</span>
                          {entry.type === "reminder_sent" ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{deliveryLabel(entry.channel)}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-h-20 bg-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold leading-tight text-foreground", tone)}>
        {value}
      </div>
    </div>
  );
}
