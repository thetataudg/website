"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCircleCheck,
  faCircleXmark,
  faCoins,
  faFileInvoiceDollar,
  faCalendarDays,
  faReceipt,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../components/LoadingState";

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

const ICONS: Record<string, any> = {
  charge_assigned: faFileInvoiceDollar,
  charge_amended: faFileInvoiceDollar,
  charge_waived: faCircleCheck,
  charge_voided: faCircleXmark,
  payment_submitted: faCoins,
  payment_verified: faCircleCheck,
  payment_rejected: faCircleXmark,
  payment_recorded: faCoins,
  payment_removed: faCircleXmark,
  plan_proposed: faCalendarDays,
  plan_approved: faCalendarDays,
  plan_denied: faCircleXmark,
  plan_completed: faCircleCheck,
  plan_defaulted: faCircleXmark,
  plan_cancelled: faCircleXmark,
  installment_missed: faCircleXmark,
  installment_paid: faCircleCheck,
  reimbursement_submitted: faReceipt,
  reimbursement_approved: faCircleCheck,
  reimbursement_denied: faCircleXmark,
  credit_applied: faRotate,
  credit_paid_out: faCoins,
  reminder_sent: faBell,
};

const TONE: Record<string, string> = {
  payment_verified: "text-success",
  charge_waived: "text-success",
  plan_approved: "text-success",
  plan_completed: "text-success",
  reimbursement_approved: "text-success",
  payment_rejected: "text-danger",
  plan_denied: "text-danger",
  plan_defaulted: "text-danger",
  installment_missed: "text-danger",
  reimbursement_denied: "text-danger",
  charge_voided: "text-danger",
  reminder_sent: "text-muted",
};

/// The paper trail, on both surfaces.
///
/// Each line's wording was frozen when it happened, so a charge later amended
/// from $250 to $200 still reads $250 here — which is the entire reason for
/// keeping the log rather than deriving it.
export default function FinanceTimeline({
  endpoint,
  title = "History",
}: {
  endpoint: string;
  title?: string;
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
      <div className="text-center py-4">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !data) {
    return <div className="alert alert-warning py-2 small">{error}</div>;
  }

  const { stats } = data;

  return (
    <section className="mt-4">
      <h2 className="h6 text-uppercase text-muted mb-3">{title}</h2>

      <div className="row g-2 mb-3">
        <Stat label="Paid to date" value={money(stats.lifetimePaidCents)} />
        <Stat
          label="Avg days to pay"
          value={stats.averageDaysToPayCharge === null ? "—" : `${stats.averageDaysToPayCharge}d`}
        />
        <Stat label="Reminders this term" value={`${stats.timesRemindedThisTerm}`} />
        <Stat
          label="Instalments missed"
          value={`${stats.installmentsMissed}`}
          tone={stats.installmentsMissed > 0 ? "text-danger" : undefined}
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
            (stats.medianVerificationDays ?? 0) >= 7 ? "text-danger" : undefined
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
          tone={stats.submissionsRejected > 0 ? "text-danger" : undefined}
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
            tone={(stats.plansDefaulted ?? 0) > 0 ? "text-danger" : undefined}
          />
        )}
      </div>

      {data.timeline.length === 0 ? (
        <p className="text-muted small">Nothing recorded yet.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {data.timeline.map((entry) => (
            <li key={entry._id} className="d-flex gap-3 pb-3">
              <div
                className={`pt-1 ${TONE[entry.type] ?? "text-secondary"}`}
                style={{ width: 20, flex: "none" }}
              >
                <FontAwesomeIcon icon={ICONS[entry.type] ?? faCoins} />
              </div>
              <div className="flex-grow-1 border-bottom pb-2">
                <div className="small">{entry.summary}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {dayLabel(entry.occurredAt)}
                  {" · "}
                  {/* "System" isn't a person hedging — it's the cron, and a
                      treasurer needs to tell that from a human decision. */}
                  {entry.actor ? entry.actor.name : "System"}
                  {entry.channel && ` · ${entry.channel}`}
                </div>
              </div>
            </li>
          ))}
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
    <div className="col-6 col-md-4 col-lg-2">
      <div className="border rounded p-2 h-100">
        <div className="text-muted text-uppercase" style={{ fontSize: 10 }}>
          {label}
        </div>
        <div className={`fw-semibold ${tone ?? ""}`}>{value}</div>
      </div>
    </div>
  );
}
