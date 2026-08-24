"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/LoadingState";

export type QueuedInstallment = {
  seq: number;
  dueDate: string | null;
  amountCents: number;
  status: string;
};

export type QueuedPlan = {
  _id: string;
  status: string;
  totalCents: number;
  installmentCount: number;
  installments: QueuedInstallment[];
  proposedAt: string | null;
  proposedAgainstDueDate: string | null;
  requestNote: string;
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
  charges: Array<{
    _id: string;
    description: string;
    term: string;
    balanceCents: number;
    dueDate: string | null;
  }>;
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
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ReviewPlanModal({
  plan,
  onClose,
  onReviewed,
}: {
  plan: QueuedPlan;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "deny") {
    if (saving) return;
    if (action === "deny" && !reviewNote.trim()) {
      setError("Say why — the member sees this, and a denial with no reason is how this stops being trusted.");
      return;
    }
    setSaving(action);
    setError(null);
    try {
      const res = await fetch(`/api/dues/plans/${plan._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't record that");
      const who = plan.member ? plan.member.fName : "The member";
      onReviewed(
        action === "approve"
          ? `Plan approved. ${who} now owes ${money(plan.installments[0]?.amountCents ?? 0)} on ${dayLabel(plan.installments[0]?.dueDate ?? null)}, then monthly.`
          : `Plan denied. ${who} has five days before the full balance reads as late.`
      );
    } catch (err: any) {
      setError(err.message || "Couldn't record that");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="modal d-block"
      role="dialog"
      style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Payment plan request</h5>
            <button
              type="button"
              className="btn btn-link text-body p-0 ms-auto"
              onClick={onClose}
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <div className="fw-semibold">
                {plan.member
                  ? `${plan.member.fName} ${plan.member.lName}`
                  : "Unknown member"}
              </div>
              <div className="small text-muted">
                #{plan.member?.rollNo ?? "—"} &middot; asked{" "}
                {dayLabel(plan.proposedAt)}
                {plan.ageDays > 0 && ` · waiting ${plan.ageDays}d`}
              </div>
            </div>

            {/* The original deadline travels with the request, because the only
                question that matters is whether they asked before it. */}
            <div className="alert alert-light border d-flex align-items-start gap-2 py-2">
              <FontAwesomeIcon icon={faCircleInfo} className="mt-1" />
              <div className="small">
                Filed against a due date of{" "}
                <strong>{dayLabel(plan.proposedAgainstDueDate)}</strong>. The
                schedule below is allowed to run past it &mdash; the deadline
                limits when they could ask, not when they can pay.
              </div>
            </div>

            {plan.requestNote && (
              <blockquote className="border-start border-3 ps-3 text-muted small mb-3">
                {plan.requestNote}
              </blockquote>
            )}

            <div className="mb-3">
              <div className="text-uppercase small text-muted mb-2">
                {money(plan.totalCents)} over {plan.installmentCount} months
              </div>
              <ul className="list-group list-group-flush border rounded">
                {plan.installments.map((installment) => (
                  <li
                    key={installment.seq}
                    className="list-group-item d-flex justify-content-between py-2"
                  >
                    <span className="text-muted small">
                      {dayLabel(installment.dueDate)}
                    </span>
                    <span className="fw-semibold">
                      {money(installment.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {plan.charges.length > 0 && (
              <div className="mb-3 small text-muted">
                Covers{" "}
                {plan.charges
                  .map(
                    (charge) =>
                      `${charge.description} (${money(charge.balanceCents)})`
                  )
                  .join(", ")}
              </div>
            )}

            <div className="mb-1">
              <label className="form-label" htmlFor="plan-review-note">
                Note <span className="text-muted">(required to deny)</span>
              </label>
              <textarea
                id="plan-review-note"
                className="form-control"
                rows={2}
                maxLength={500}
                placeholder="Why this doesn't work, in words they can act on"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </div>

            {error && (
              <div className="alert alert-danger mt-3 mb-0 py-2">{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-light" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={saving !== null}
              onClick={() => review("deny")}
            >
              {saving === "deny" ? <LoadingSpinner size="sm" /> : "Deny"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving !== null}
              onClick={() => review("approve")}
            >
              {saving === "approve" ? <LoadingSpinner size="sm" /> : "Approve plan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
