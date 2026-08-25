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
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { LoadingSpinner } from "../../components/LoadingState";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  charge_waived: POSITIVE,
  plan_approved: POSITIVE,
  plan_completed: POSITIVE,
  reimbursement_approved: POSITIVE,
  payment_rejected: "text-destructive",
  plan_denied: "text-destructive",
  plan_defaulted: "text-destructive",
  installment_missed: "text-destructive",
  reimbursement_denied: "text-destructive",
  charge_voided: "text-destructive",
  reminder_sent: "text-muted-foreground",
};

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

  return (
    <section className={bare ? undefined : "mt-6"}>
      {bare ? null : <SectionHeader className="mb-3" title={title} as="h2" />}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Paid to date" value={money(stats.lifetimePaidCents)} />
        <Stat
          label="Avg days to pay"
          value={stats.averageDaysToPayCharge === null ? "None yet" : `${stats.averageDaysToPayCharge}d`}
        />
        <Stat label="Reminders this term" value={`${stats.timesRemindedThisTerm}`} />
        <Stat
          label="Instalments missed"
          value={`${stats.installmentsMissed}`}
          tone={stats.installmentsMissed > 0 ? "text-destructive" : undefined}
        />
        {/* The paidOn/recordedAt split makes this free, and a queue running
            eight days behind is something the chapter should be able to see. */}
        <Stat
          label="Typical review wait"
          value={
            stats.medianVerificationDays === null
              ? "None yet"
              : `${stats.medianVerificationDays}d`
          }
          tone={
            (stats.medianVerificationDays ?? 0) >= 7
              ? "text-destructive"
              : undefined
          }
        />
        <Stat label="Credit held" value={money(stats.creditHeldCents)} />
        {/* A rejected claim is a disagreement the record kept. Worth surfacing:
            it's the number a treasurer wants before a difficult conversation. */}
        <Stat
          label="Claims filed"
          value={
            stats.submissionsRejected > 0
              ? `${stats.submissionsFiled} · ${stats.submissionsRejected} rejected`
              : `${stats.submissionsFiled}`
          }
          tone={stats.submissionsRejected > 0 ? "text-destructive" : undefined}
        />
        {/* Plans are per-charge, so a member can have run several. */}
        {(stats.plansCompleted ?? 0) +
          (stats.plansLive ?? 0) +
          (stats.plansDefaulted ?? 0) >
          0 && (
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
        )}
      </div>

      {data.timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="mb-0 list-none space-y-0 p-0">
          {data.timeline.map((entry) => {
            const Icon = ICONS[entry.type] ?? Coins;
            return (
              <li key={entry._id} className="flex gap-3">
                <div
                  className={cn(
                    "shrink-0 pt-2.5",
                    TONE[entry.type] ?? "text-muted-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0 flex-1 border-b border-border py-2">
                  <div className="text-sm text-foreground">{entry.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {dayLabel(entry.occurredAt)}
                    {" · "}
                    {/* "System" isn't a person hedging — it's the cron, and a
                        treasurer needs to tell that from a human decision. */}
                    {entry.actor ? entry.actor.name : "System"}
                    {entry.channel && ` · ${entry.channel}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
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
    <div className="h-full rounded-lg border border-border bg-card p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-semibold text-foreground", tone)}>{value}</div>
    </div>
  );
}
