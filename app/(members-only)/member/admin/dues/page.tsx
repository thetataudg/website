"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../../components/LoadingState";
import PayOutCreditModal from "./PayOutCreditModal";
import RemindModal from "./RemindModal";
import MemberHistoryModal from "./MemberHistoryModal";
import { exportAuditPdf } from "./exportAudit";

type RosterRow = {
  memberId: string;
  rollNo: string;
  fName: string;
  lName: string;
  status: string;
  assignedCents: number;
  paidCents: number;
  balanceCents: number;
  creditCents: number;
  chargeCount: number;
  nextDueDate: string | null;
  awaitingReview: boolean;
  isOverdue: boolean;
  /// The live plan needing most attention, present only while one is running.
  /// When it is, this member's "next due" is an installment, not the whole
  /// balance. A member can run several at once — `planCount` says how many.
  plan: {
    _id: string;
    planCount?: number;
    installmentCount: number;
    currentSeq: number | null;
    amountDueNowCents: number;
    dueNowDate: string | null;
    missedCount: number;
    isBehind: boolean;
  } | null;
};

type RosterResponse = {
  members: RosterRow[];
  totals: {
    outstandingCents: number;
    collectedCents: number;
    memberCount: number;
    owingCount: number;
    overdueCount: number;
    pendingReviewCount: number;
    creditOwedCents: number;
  };
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Phoenix",
  });
}

type Filter = "owing" | "overdue" | "credit" | "all";

export default function DuesRosterPage() {
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("owing");
  const [payingOut, setPayingOut] = useState<RosterRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<RosterRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues?view=roster");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load the roster");
      }
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message || "Couldn't load the roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.members;
    if (filter === "owing") list = list.filter((row) => row.balanceCents > 0);
    if (filter === "overdue") list = list.filter((row) => row.isOverdue);
    if (filter === "credit") list = list.filter((row) => row.creditCents > 0);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (row) =>
          `${row.fName} ${row.lName}`.toLowerCase().includes(needle) ||
          row.rollNo.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [data, filter, query]);

  if (loading) return <LoadingState message="Loading dues..." />;

  if (error || !data) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">{error || "Couldn't load the roster"}</div>
        <button className="btn btn-outline-secondary" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  const { totals } = data;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-1">
        <h1 className="h4 mb-0">Dues</h1>
        <div className="d-flex gap-2">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setReminding(true)}
        >
          Remind
        </button>
        <button
          className="btn btn-outline-secondary btn-sm"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const res = await fetch("/api/dues/export");
              const payload = await res.json();
              if (!res.ok) throw new Error(payload?.error || "Couldn't build the export");
              await exportAuditPdf(payload);
            } catch (err: any) {
              setFlash(err.message || "Couldn't build the export");
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Building…" : "Export"}
        </button>
        <Link href="/member/admin/dues/requests" className="btn btn-outline-primary btn-sm">
          Requests
          {totals.pendingReviewCount > 0 && (
            <span className="badge bg-primary ms-2">
              {totals.pendingReviewCount}
            </span>
          )}
        </Link>
        </div>
      </div>
      <p className="text-muted">Who owes what.</p>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div className="row g-3 mb-4">
        {[
          { label: "Outstanding", value: money(totals.outstandingCents) },
          { label: "Collected", value: money(totals.collectedCents) },
          { label: "Still owing", value: `${totals.owingCount}` },
          {
            label: "Overdue",
            value: `${totals.overdueCount}`,
            danger: totals.overdueCount > 0,
          },
          // The chapter's own debt, shown as plainly as the members'.
          { label: "Owed to members", value: money(totals.creditOwedCents ?? 0) },
        ].map((tile) => (
          <div className="col-6 col-lg-3 col-xl-2" key={tile.label}>
            <div className="card h-100">
              <div className="card-body">
                <div className="text-muted small text-uppercase">{tile.label}</div>
                <div className={`fs-4 fw-semibold ${tile.danger ? "text-danger" : ""}`}>
                  {tile.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex gap-2 flex-wrap mb-3">
        <div className="btn-group btn-group-sm">
          {(["owing", "overdue", "credit", "all"] as Filter[]).map((option) => (
            <button
              key={option}
              className={`btn btn-outline-secondary ${filter === option ? "active" : ""}`}
              onClick={() => setFilter(option)}
            >
              {option === "owing"
                ? "Owing"
                : option === "overdue"
                ? "Overdue"
                : option === "credit"
                ? "We owe them"
                : "Everyone"}
            </button>
          ))}
        </div>
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 280 }}
          placeholder="Name or roll number"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-muted py-4 text-center">Nobody matches that.</p>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Member</th>
                <th className="text-end">Assigned</th>
                <th className="text-end">Paid</th>
                <th className="text-end">Balance</th>
                <th className="text-end">Credit</th>
                <th>Next due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-start text-decoration-none"
                      onClick={() => setViewingHistory(row)}
                    >
                      <div className="fw-semibold">
                        {row.fName} {row.lName}
                      </div>
                      <div className="small text-muted">#{row.rollNo}</div>
                    </button>
                  </td>
                  <td className="text-end">{money(row.assignedCents)}</td>
                  <td className="text-end text-muted">{money(row.paidCents)}</td>
                  <td className="text-end fw-semibold">
                    {row.balanceCents > 0 ? money(row.balanceCents) : "—"}
                  </td>
                  <td className="text-end">
                    {row.creditCents > 0 ? (
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => setPayingOut(row)}
                      >
                        {money(row.creditCents)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {row.plan ? (
                      <>
                        <div>{dayLabel(row.plan.dueNowDate)}</div>
                        <div className="small text-muted">
                          {money(row.plan.amountDueNowCents)} · installment{" "}
                          {row.plan.currentSeq ?? row.plan.installmentCount} of{" "}
                          {row.plan.installmentCount}
                        </div>
                      </>
                    ) : (
                      dayLabel(row.nextDueDate)
                    )}
                  </td>
                  <td>
                    {row.awaitingReview && (
                      <span className="badge bg-info text-dark">
                        <FontAwesomeIcon icon={faClock} className="me-1" />
                        In review
                      </span>
                    )}
                    {row.plan && !row.plan.isBehind && (
                      <span className="badge bg-secondary">
                        {(row.plan.planCount ?? 1) > 1
                          ? `On ${row.plan.planCount} plans`
                          : "On a plan"}
                      </span>
                    )}
                    {row.plan && row.plan.isBehind && (
                      <span className="badge bg-danger">
                        {row.plan.missedCount} missed
                      </span>
                    )}
                    {row.isOverdue && !row.plan && (
                      <span className="badge bg-danger">
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          className="me-1"
                        />
                        Overdue
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewingHistory && (
        <MemberHistoryModal
          rollNo={viewingHistory.rollNo}
          name={`${viewingHistory.fName} ${viewingHistory.lName}`}
          onClose={() => setViewingHistory(null)}
        />
      )}
      {reminding && (
        <RemindModal
          onClose={() => setReminding(false)}
          onSent={(message) => {
            setReminding(false);
            setFlash(message);
            load();
          }}
        />
      )}
      {payingOut && (
        <PayOutCreditModal
          member={{
            memberId: payingOut.memberId,
            rollNo: payingOut.rollNo,
            name: `${payingOut.fName} ${payingOut.lName}`,
            creditCents: payingOut.creditCents,
          }}
          onClose={() => setPayingOut(null)}
          onPaid={(message) => {
            setPayingOut(null);
            setFlash(message);
            load();
          }}
        />
      )}
    </div>
  );
}
