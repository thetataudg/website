"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faInbox,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../../../components/LoadingState";
import VerifyPaymentModal, { QueuedSubmission } from "./VerifyPaymentModal";
import ReviewReimbursementModal, {
  QueuedReimbursement,
} from "./ReviewReimbursementModal";
import ReviewPlanModal, { QueuedPlan } from "./ReviewPlanModal";

type Tab = "payments" | "reimbursements" | "plans";

type PlanQueue = {
  plans: QueuedPlan[];
  totals: {
    pendingCount: number;
    pendingCents: number;
    activeCount: number;
    defaultedCount: number;
    oldestPendingDays: number;
  };
};

type ReimbursementQueue = {
  reimbursements: QueuedReimbursement[];
  totals: { pendingCount: number; pendingCents: number; oldestPendingDays: number };
};

type QueueResponse = {
  submissions: QueuedSubmission[];
  totals: {
    pendingCount: number;
    pendingCents: number;
    oldestPendingDays: number;
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

export default function DuesRequestsPage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<QueuedSubmission | null>(null);
  const [claims, setClaims] = useState<ReimbursementQueue | null>(null);
  const [reviewingClaim, setReviewingClaim] = useState<QueuedReimbursement | null>(null);
  const [plans, setPlans] = useState<PlanQueue | null>(null);
  const [reviewingPlan, setReviewingPlan] = useState<QueuedPlan | null>(null);
  const [tab, setTab] = useState<Tab>("payments");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/submissions?status=pending");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load the queue");
      }
      setData(await res.json());
      setError(null);

      const claimRes = await fetch("/api/reimbursements?status=pending");
      if (claimRes.ok) setClaims(await claimRes.json());

      const planRes = await fetch("/api/dues/plans?status=pending");
      if (planRes.ok) setPlans(await planRes.json());
    } catch (err: any) {
      setError(err.message || "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading requests..." />;

  if (error || !data) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">{error || "Couldn't load the queue"}</div>
        <button className="btn btn-outline-secondary" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  const { submissions, totals } = data;
  const claimTotals = claims?.totals ?? {
    pendingCount: 0,
    pendingCents: 0,
    oldestPendingDays: 0,
  };
  const planTotals = plans?.totals ?? {
    pendingCount: 0,
    pendingCents: 0,
    activeCount: 0,
    defaultedCount: 0,
    oldestPendingDays: 0,
  };

  return (
    <div className="container py-4" style={{ maxWidth: 960 }}>
      <h1 className="h4 mb-1">Requests</h1>
      <p className="text-muted">
        Payments members have reported, waiting on you.
      </p>

      {flash && (
        <div className="alert alert-success d-flex align-items-center gap-2">
          <FontAwesomeIcon icon={faCircleCheck} />
          <span>{flash}</span>
        </div>
      )}

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "payments" ? "active" : ""}`}
            onClick={() => setTab("payments")}
          >
            Payments
            {totals.pendingCount > 0 && (
              <span className="badge bg-primary ms-2">{totals.pendingCount}</span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "reimbursements" ? "active" : ""}`}
            onClick={() => setTab("reimbursements")}
          >
            Reimbursements
            {claimTotals.pendingCount > 0 && (
              <span className="badge bg-primary ms-2">
                {claimTotals.pendingCount}
              </span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === "plans" ? "active" : ""}`}
            onClick={() => setTab("plans")}
          >
            Payment plans
            {planTotals.pendingCount > 0 && (
              <span className="badge bg-primary ms-2">
                {planTotals.pendingCount}
              </span>
            )}
          </button>
        </li>
      </ul>

      {tab === "plans" ? (
        <PlanList rows={plans?.plans ?? []} onReview={setReviewingPlan} />
      ) : tab === "reimbursements" ? (
        <ReimbursementList
          rows={claims?.reimbursements ?? []}
          onReview={setReviewingClaim}
        />
      ) : (
      <>
      <div className="row g-3 mb-4">
        <div className="col-sm-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase">Waiting</div>
              <div className="fs-4 fw-semibold">{totals.pendingCount}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase">Unconfirmed</div>
              <div className="fs-4 fw-semibold">{money(totals.pendingCents)}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small text-uppercase">Oldest</div>
              <div
                className={`fs-4 fw-semibold ${totals.oldestPendingDays >= 7 ? "text-danger" : ""}`}
              >
                {totals.oldestPendingDays}d
              </div>
            </div>
          </div>
        </div>
      </div>

      {totals.oldestPendingDays >= 7 && (
        <div className="alert alert-warning d-flex align-items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-1" />
          <div>
            Something has been waiting {totals.oldestPendingDays} days. Nobody is
            marked late while their claim sits here, but they also can&apos;t see
            their balance clear.
          </div>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="text-center text-muted py-5">
          <FontAwesomeIcon icon={faInbox} size="2x" className="mb-3 d-block mx-auto" />
          Nothing waiting. The queue is clear.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Member</th>
                <th>Charge</th>
                <th>Paid on</th>
                <th className="text-end">Amount</th>
                <th>Waiting</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission._id}>
                  <td>
                    <div className="fw-semibold">
                      {submission.member
                        ? `${submission.member.fName} ${submission.member.lName}`
                        : "Unknown"}
                    </div>
                    <div className="small text-muted">
                      #{submission.member?.rollNo ?? "—"}
                    </div>
                  </td>
                  <td>
                    <div>{submission.charge?.description ?? "—"}</div>
                    <div className="small text-muted">
                      {submission.charge?.term}
                      {submission.reference && ` · ${submission.reference}`}
                    </div>
                  </td>
                  <td>
                    <div>{dayLabel(submission.paidOn)}</div>
                    <div className="small text-muted">{submission.method}</div>
                  </td>
                  <td className="text-end fw-semibold">
                    {money(submission.amountCents)}
                  </td>
                  <td>
                    <span
                      className={`badge ${submission.ageDays >= 7 ? "bg-danger" : submission.ageDays >= 3 ? "bg-warning text-dark" : "bg-secondary"}`}
                    >
                      {submission.ageDays}d
                    </span>
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setReviewing(submission)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </>
      )}

      {reviewingPlan && (
        <ReviewPlanModal
          plan={reviewingPlan}
          onClose={() => setReviewingPlan(null)}
          onReviewed={(message) => {
            setReviewingPlan(null);
            setFlash(message);
            load();
          }}
        />
      )}

      {reviewingClaim && (
        <ReviewReimbursementModal
          reimbursement={reviewingClaim}
          onClose={() => setReviewingClaim(null)}
          onReviewed={(message) => {
            setReviewingClaim(null);
            setFlash(message);
            load();
          }}
        />
      )}

      {reviewing && (
        <VerifyPaymentModal
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={(message) => {
            setReviewing(null);
            setFlash(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function ReimbursementList({
  rows,
  onReview,
}: {
  rows: QueuedReimbursement[];
  onReview: (claim: QueuedReimbursement) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center text-muted py-5">
        <FontAwesomeIcon icon={faInbox} size="2x" className="mb-3 d-block mx-auto" />
        No claims waiting.
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table align-middle">
        <thead>
          <tr>
            <th>Member</th>
            <th>What for</th>
            <th>Receipts</th>
            <th className="text-end">Amount</th>
            <th>Waiting</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((claim) => (
            <tr key={claim._id}>
              <td>
                <div className="fw-semibold">
                  {claim.member
                    ? `${claim.member.fName} ${claim.member.lName}`
                    : "Unknown"}
                </div>
                <div className="small text-muted">
                  #{claim.member?.rollNo ?? "\u2014"}
                </div>
              </td>
              <td>
                <div>{claim.description}</div>
                <div className="small text-muted">{claim.category}</div>
              </td>
              <td>
                {claim.receiptUrls.length > 0 ? (
                  <span className="badge bg-secondary">
                    {claim.receiptUrls.length}
                  </span>
                ) : (
                  <span className="badge bg-warning text-dark">none</span>
                )}
              </td>
              <td className="text-end fw-semibold">{money(claim.amountCents)}</td>
              <td>
                <span
                  className={`badge ${claim.ageDays >= 7 ? "bg-danger" : claim.ageDays >= 3 ? "bg-warning text-dark" : "bg-secondary"}`}
                >
                  {claim.ageDays}d
                </span>
              </td>
              <td className="text-end">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onReview(claim)}
                >
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/// Proposals waiting on an answer.
///
/// The due date each was filed against is the column that matters: a request
/// that beat the deadline is one the member is entitled to have considered, and
/// they are not being marked late while it sits here.
function PlanList({
  rows,
  onReview,
}: {
  rows: QueuedPlan[];
  onReview: (plan: QueuedPlan) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center text-muted py-5">
        <FontAwesomeIcon icon={faInbox} size="2x" className="mb-3 d-block mx-auto" />
        No plan requests waiting.
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table align-middle">
        <thead>
          <tr>
            <th>Member</th>
            <th>Asked for</th>
            <th>Filed against</th>
            <th className="text-end">Per month</th>
            <th>Waiting</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((plan) => (
            <tr key={plan._id}>
              <td>
                <div className="fw-semibold">
                  {plan.member
                    ? `${plan.member.fName} ${plan.member.lName}`
                    : "Unknown"}
                </div>
                <div className="small text-muted">
                  #{plan.member?.rollNo ?? "\u2014"}
                </div>
              </td>
              <td>
                <div>
                  {money(plan.totalCents)} over {plan.installmentCount} months
                </div>
                {plan.requestNote && (
                  <div className="small text-muted text-truncate" style={{ maxWidth: 260 }}>
                    {plan.requestNote}
                  </div>
                )}
              </td>
              <td>
                <div>{dayLabel(plan.proposedAgainstDueDate)}</div>
                <div className="small text-muted">
                  filed {dayLabel(plan.proposedAt)}
                </div>
              </td>
              <td className="text-end fw-semibold">
                {money(plan.installments[0]?.amountCents ?? 0)}
              </td>
              <td>
                <span
                  className={`badge ${plan.ageDays >= 7 ? "bg-danger" : plan.ageDays >= 3 ? "bg-warning text-dark" : "bg-secondary"}`}
                >
                  {plan.ageDays}d
                </span>
              </td>
              <td className="text-end">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onReview(plan)}
                >
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
