"use client";

import { useCallback, useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faCircleCheck,
  faClock,
  faReceipt,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../components/LoadingState";
import MarkAsPaidModal, { PayableCharge } from "./MarkAsPaidModal";
import SubmitReimbursementModal from "./SubmitReimbursementModal";
import RequestPlanModal from "./RequestPlanModal";
import FinanceTimeline from "./FinanceTimeline";
import { maxInstallmentsFor } from "@/lib/planMath";

type Charge = {
  _id: string;
  term: string;
  description: string;
  category: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
};

type Submission = {
  _id: string;
  chargeId: string;
  amountCents: number;
  method: string;
  paidOn: string | null;
  submittedAt: string | null;
  status: string;
  reviewNote: string;
};

type Reimbursement = {
  _id: string;
  amountCents: number;
  description: string;
  category: string;
  purchasedOn: string | null;
  status: string;
  reviewNote: string;
  submittedAt: string | null;
};

type Installment = {
  seq: number;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: string;
};

type Plan = {
  _id: string;
  status: string;
  chargeIds?: string[];
  term?: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  installmentCount: number;
  installments: Installment[];
  currentSeq: number | null;
  amountDueNowCents: number;
  dueNowDate: string | null;
  missedCount: number;
  requestNote: string;
  reviewNote: string;
  graceUntil: string | null;
};

type DuesResponse = {
  currency: string;
  balanceCents: number;
  paidCents: number;
  amountDueNowCents: number;
  dueNowDate: string | null;
  creditCents: number;
  hasOverdue: boolean;
  awaitingReview: boolean;
  pendingCents: number;
  charges: Charge[];
  submissions: Submission[];
  plan: Plan | null;
  /// Several plans can run at once, one per set of charges.
  plans?: Plan[];
  /// Paid off, denied or cancelled — kept readable, out of the way.
  archivedPlans?: Plan[];
  /// Charges no live plan covers, so a new plan can still be proposed for them.
  planEligibleChargeIds?: string[];
  awaitingPlanReview: boolean;
  nextDueDate: string | null;
};

function money(cents: number) {
  const abs = Math.abs(cents);
  const body = (abs / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
  });
  return cents < 0 ? `-${body}` : body;
}

function dayLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

const INSTALLMENT_BADGES: Record<string, { className: string; label: string }> = {
  paid: { className: "bg-success", label: "Paid" },
  due: { className: "bg-primary", label: "Due" },
  late: { className: "bg-danger", label: "Late" },
  waived: { className: "bg-secondary", label: "Waived" },
  upcoming: { className: "bg-light text-dark border", label: "Upcoming" },
};

function InstallmentBadge({ status }: { status: string }) {
  const badge = INSTALLMENT_BADGES[status] ?? INSTALLMENT_BADGES.upcoming;
  return <span className={`badge ${badge.className}`}>{badge.label}</span>;
}

export default function DuesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<DuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableCharge | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/me");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load your dues");
      }
      setData(await res.json());
      setError(null);

      // A secondary panel — a failure here shouldn't blank out the balance,
      // which is what people actually came for.
      try {
        const claims = await fetch("/api/reimbursements?mine=1");
        if (claims.ok) {
          const payload = await claims.json();
          setReimbursements(payload.reimbursements ?? []);
        }
      } catch {
        /* leave the panel empty */
      }
    } catch (err: any) {
      setError(err.message || "Couldn't load your dues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) load();
  }, [isLoaded, isSignedIn, load]);

  if (!isLoaded) return <LoadingState message="Loading..." />;
  if (!isSignedIn) return <RedirectToSignIn />;
  if (loading) return <LoadingState message="Loading your dues..." />;

  if (error || !data) {
    return (
      <main className="container py-4">
        <div className="alert alert-danger">{error || "Couldn't load your dues"}</div>
        <button className="btn btn-outline-secondary" onClick={() => load()}>
          Try again
        </button>
      </main>
    );
  }

  const pendingByCharge = new Map(
    data.submissions
      .filter((submission) => submission.status === "pending")
      .map((submission) => [submission.chargeId, submission])
  );
  const outstanding = data.charges.filter((charge) => charge.balanceCents > 0);
  const settled = data.charges.filter((charge) => charge.balanceCents === 0);

  // Exactly one of these is ever true: credit auto-applies to open charges, so
  // owing money and holding credit can't both be the case.
  const owes = data.amountDueNowCents > 0;
  const holdsCredit = !owes && data.creditCents > 0;

  // `plans` is the plural field; `plan` is what older responses carried. Fall
  // back so a cached payload still renders.
  const livePlans = data.plans ?? (data.plan ? [data.plan] : []);
  const archivedPlans = data.archivedPlans ?? [];
  const activePlans = livePlans.filter((row) => row.status === "active");
  const pendingPlans = livePlans.filter((row) => row.status === "pending");
  // A denial is archived immediately, but the member still needs to be told —
  // and only for as long as their five-day grace window lasts.
  const deniedInGrace = archivedPlans.filter(
    (row) =>
      row.status === "denied" &&
      (!row.graceUntil || new Date(row.graceUntil) >= new Date())
  );
  // A plan can only be asked for before the earliest due date passes, and only
  // if the balance is big enough to split. Offering a button that leads to a
  // refusal is worse than not offering one.
  //
  // What a *new* plan could cover: everything owed that no live plan already
  // speaks for. A member with one plan running can still put a later charge on
  // a second one — the rule is one plan per charge, not one plan per member.
  const plannedChargeIds = new Set(
    livePlans.flatMap((row) => row.chargeIds ?? [])
  );
  const eligible = outstanding.filter(
    (charge) =>
      charge.balanceCents > 0 &&
      (data.planEligibleChargeIds
        ? data.planEligibleChargeIds.includes(charge._id)
        : !plannedChargeIds.has(charge._id))
  );
  // With several plans on screen, "Your payment plan" stops being an identifier.
  // Name each one by what it actually covers.
  const planLabel = (row: Plan) => {
    const names = (row.chargeIds ?? [])
      .map((id) => data.charges.find((charge) => charge._id === id)?.description)
      .filter(Boolean) as string[];
    if (!names.length) return "Your payment plan";
    const unique = Array.from(new Set(names));
    return unique.length === 1 ? unique[0] : `${unique[0]} +${unique.length - 1} more`;
  };

  const eligibleCents = eligible.reduce(
    (sum, charge) => sum + charge.balanceCents,
    0
  );
  const canRequestPlan =
    eligible.length > 0 &&
    eligibleCents > 0 &&
    maxInstallmentsFor(eligibleCents) >= 2 &&
    !data.hasOverdue &&
    !data.awaitingReview;

  return (
    <main className="container py-4" style={{ maxWidth: 840 }}>
      <h1 className="h3 mb-1">Dues</h1>
      <p className="text-muted mb-4">Your balance with the chapter.</p>

      {flash && (
        <div className="alert alert-success d-flex align-items-center gap-2">
          <FontAwesomeIcon icon={faCircleCheck} />
          <span>{flash}</span>
        </div>
      )}

      <section className="card mb-4">
        <div className="card-body">
          {owes && (
            <>
              <div className="text-muted small text-uppercase">You owe</div>
              <div className="display-6 fw-semibold">
                {money(data.amountDueNowCents)}
              </div>
              {data.dueNowDate && (
                <div className={data.hasOverdue ? "text-danger" : "text-muted"}>
                  {data.hasOverdue ? "Was due " : "Due "}
                  {dayLabel(data.dueNowDate)}
                </div>
              )}
              {/* On a plan the headline is this month, so the whole balance
                  can't just disappear — it moves to secondary text. */}
              {activePlans.length > 0 &&
                data.balanceCents > data.amountDueNowCents && (
                  <div className="small text-muted mt-1">
                    {money(data.balanceCents)} owed in total, on{" "}
                    {activePlans.length === 1
                      ? `a ${activePlans[0].installmentCount}-month plan`
                      : `${activePlans.length} payment plans`}
                  </div>
                )}
            </>
          )}

          {holdsCredit && (
            <>
              <div className="text-muted small text-uppercase">
                The chapter owes you
              </div>
              <div className="display-6 fw-semibold text-success">
                {money(data.creditCents)}
              </div>
              <div className="text-muted">
                This comes off your next dues automatically.
              </div>
            </>
          )}

          {!owes && !holdsCredit && (
            <>
              <div className="display-6 fw-semibold text-success">
                <FontAwesomeIcon icon={faCircleCheck} className="me-2" />
                All settled
              </div>
              <div className="text-muted">
                Nothing owed, nothing outstanding.
              </div>
            </>
          )}
        </div>
      </section>

      <div className="d-flex gap-2 flex-wrap mb-4">
        {canRequestPlan && (
          <button className="btn btn-outline-primary" onClick={() => setPlanning(true)}>
            <FontAwesomeIcon icon={faCalendarDays} className="me-2" />
            Ask to pay in installments
          </button>
        )}
        <button
          className="btn btn-outline-secondary"
          onClick={() => setClaiming(true)}
        >
          <FontAwesomeIcon icon={faReceipt} className="me-2" />
          Claim a reimbursement
        </button>
      </div>

      {pendingPlans.map((plan) => (
        <div key={plan._id} className="alert alert-info d-flex align-items-start gap-2">
          <FontAwesomeIcon icon={faClock} className="mt-1" />
          <div>
            <strong>
              Plan request for {money(plan.totalCents)} over{" "}
              {plan.installmentCount} months is with the treasurer.
            </strong>
            <div className="small">
              You asked before your due date, so you won&apos;t be marked late or
              reminded while it&apos;s in the queue. Nothing is agreed until
              it&apos;s approved.
            </div>
          </div>
        </div>
      ))}

      {deniedInGrace.map((plan) => (
        <div key={plan._id} className="alert alert-warning d-flex align-items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-1" />
          <div>
            <strong>Your plan request wasn&apos;t approved.</strong>
            {plan.reviewNote && <div className="small">{plan.reviewNote}</div>}
            <div className="small">
              The full {money(plan.totalCents)} is owed
              {plan.graceUntil && ` by ${dayLabel(plan.graceUntil)}`}. Talk to
              the treasurer if that isn&apos;t workable.
            </div>
          </div>
        </div>
      ))}

      {activePlans.map((activePlan) => (
        <section key={activePlan._id} className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
              <div>
                <h2 className="h6 text-uppercase text-muted mb-1">
                  {activePlans.length > 1 ? planLabel(activePlan) : "Your payment plan"}
                </h2>
                <div className="small text-muted">
                  {money(activePlan.paidCents)} of{" "}
                  {money(activePlan.totalCents)} paid &middot;{" "}
                  {activePlan.installmentCount} installments
                </div>
              </div>
              {activePlan.missedCount > 0 && (
                <span className="badge bg-danger align-self-start">
                  {activePlan.missedCount} missed
                </span>
              )}
            </div>

            <div className="progress mb-3" style={{ height: 6 }}>
              <div
                className="progress-bar"
                role="progressbar"
                aria-label="Plan progress"
                aria-valuenow={activePlan.paidCents}
                aria-valuemin={0}
                aria-valuemax={activePlan.totalCents}
                style={{
                  width: `${Math.min(100, Math.round((activePlan.paidCents / Math.max(1, activePlan.totalCents)) * 100))}%`,
                }}
              />
            </div>

            <ul className="list-group list-group-flush">
              {activePlan.installments.map((installment) => (
                <li
                  key={installment.seq}
                  className="list-group-item d-flex justify-content-between align-items-center px-0 py-2"
                >
                  <span className="d-flex align-items-center gap-2">
                    <InstallmentBadge status={installment.status} />
                    <span
                      className={
                        installment.status === "paid" ? "text-muted" : undefined
                      }
                    >
                      {dayLabel(installment.dueDate)}
                    </span>
                  </span>
                  <span
                    className={
                      installment.status === "paid"
                        ? "text-muted text-decoration-line-through"
                        : "fw-semibold"
                    }
                  >
                    {money(installment.amountCents)}
                    {installment.remainingCents > 0 &&
                      installment.paidCents > 0 && (
                        <span className="small text-muted ms-2">
                          {money(installment.remainingCents)} left
                        </span>
                      )}
                  </span>
                </li>
              ))}
            </ul>

            {activePlan.missedCount > 0 && (
              <p className="small text-muted mb-0 mt-3">
                A missed installment doesn&apos;t cancel your plan or make the
                whole balance due &mdash; you&apos;re asked for what you&apos;re
                behind on, nothing more.
              </p>
            )}
          </div>
        </section>
      ))}

      {archivedPlans.length > 0 && (
        <section className="mb-4">
          <h2 className="h6 text-uppercase text-muted mb-2">Finished plans</h2>
          <ul className="list-group">
            {archivedPlans.map((row) => (
              <li
                key={row._id}
                className="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2"
              >
                <span>
                  <span className="text-muted">{planLabel(row)}</span>
                  <span className="small text-muted d-block">
                    {row.installmentCount} installments &middot;{" "}
                    {money(row.totalCents)}
                  </span>
                </span>
                <span className="badge bg-secondary">
                  {row.status === "denied"
                    ? "Not approved"
                    : row.status === "cancelled"
                      ? "Cancelled"
                      : "Paid off"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.awaitingReview && (
        <div className="alert alert-info d-flex align-items-start gap-2">
          <FontAwesomeIcon icon={faClock} className="mt-1" />
          <div>
            <strong>{money(data.pendingCents)} waiting to be checked off.</strong>
            <div className="small">
              You reported this, and the treasurer hasn&apos;t confirmed it yet.
              You won&apos;t be marked late or reminded about it while it&apos;s
              in the queue.
            </div>
          </div>
        </div>
      )}

      {outstanding.length > 0 && (
        <section className="mb-4">
          <h2 className="h6 text-uppercase text-muted mb-3">Outstanding</h2>
          <div className="list-group">
            {outstanding.map((charge) => {
              const pending = pendingByCharge.get(charge._id);
              return (
                <div key={charge._id} className="list-group-item">
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                    <div>
                      <div className="fw-semibold">{charge.description}</div>
                      <div className="small text-muted">
                        {charge.term}
                        {charge.dueDate && ` · due ${dayLabel(charge.dueDate)}`}
                        {charge.paidCents > 0 &&
                          ` · ${money(charge.paidCents)} paid so far`}
                      </div>
                      {charge.isOverdue && (
                        <div className="small text-danger mt-1">
                          <FontAwesomeIcon
                            icon={faTriangleExclamation}
                            className="me-1"
                          />
                          Past due
                        </div>
                      )}
                      {pending && (
                        <div className="small text-info mt-1">
                          <FontAwesomeIcon icon={faClock} className="me-1" />
                          {money(pending.amountCents)} reported{" "}
                          {pending.paidOn && `for ${dayLabel(pending.paidOn)}`} —
                          waiting on the treasurer
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="fs-5 fw-semibold">
                        {money(charge.balanceCents)}
                      </div>
                      {!pending && (
                        <button
                          className="btn btn-sm btn-primary mt-1"
                          onClick={() =>
                            setPaying({
                              _id: charge._id,
                              description: charge.description,
                              term: charge.term,
                              balanceCents: charge.balanceCents,
                            })
                          }
                        >
                          I paid this
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {settled.length > 0 && (
        <section>
          <h2 className="h6 text-uppercase text-muted mb-3">Settled</h2>
          <div className="list-group">
            {settled.map((charge) => (
              <div
                key={charge._id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <div>{charge.description}</div>
                  <div className="small text-muted">
                    {charge.term}
                    {charge.status !== "open" && ` · ${charge.status}`}
                  </div>
                </div>
                <span className="text-success">
                  <FontAwesomeIcon icon={faCircleCheck} className="me-1" />
                  {money(charge.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {reimbursements.length > 0 && (
        <section className="mt-4">
          <h2 className="h6 text-uppercase text-muted mb-3">Your claims</h2>
          <div className="list-group">
            {reimbursements.map((claim) => (
              <div key={claim._id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <div className="fw-semibold">{claim.description}</div>
                    <div className="small text-muted">
                      {claim.purchasedOn && dayLabel(claim.purchasedOn)}
                      {" · "}
                      {claim.category}
                    </div>
                    {claim.status === "denied" && claim.reviewNote && (
                      <div className="small text-danger mt-1">
                        Denied &mdash; {claim.reviewNote}
                      </div>
                    )}
                  </div>
                  <div className="text-end">
                    <div className="fw-semibold">{money(claim.amountCents)}</div>
                    <span
                      className={`badge ${
                        claim.status === "approved"
                          ? "bg-success"
                          : claim.status === "denied"
                          ? "bg-danger"
                          : "bg-secondary"
                      }`}
                    >
                      {claim.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <FinanceTimeline endpoint="/api/dues/history/me" title="Your history" />

      {claiming && (
        <SubmitReimbursementModal
          onClose={() => setClaiming(false)}
          onFiled={() => {
            setClaiming(false);
            setFlash("Claim sent. The treasurer will review it.");
            load();
          }}
        />
      )}

      {planning && (
        <RequestPlanModal
          balance={{
            term: eligible[0]?.term ?? outstanding[0]?.term ?? "",
            charges: eligible.map((charge) => ({
              _id: charge._id,
              description: charge.description,
              balanceCents: charge.balanceCents,
              dueDate: charge.dueDate,
            })),
          }}
          onClose={() => setPlanning(false)}
          onFiled={() => {
            setPlanning(false);
            setFlash(
              "Request sent. You asked in time — you won't be marked late while the treasurer looks at it."
            );
            load();
          }}
        />
      )}

      {paying && (
        <MarkAsPaidModal
          charge={paying}
          onClose={() => setPaying(null)}
          onFiled={() => {
            setPaying(null);
            setFlash(
              "Sent. The treasurer will confirm it — you're covered from the date you entered."
            );
            load();
          }}
        />
      )}
    </main>
  );
}
