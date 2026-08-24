"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/LoadingState";

export type QueuedSubmission = {
  _id: string;
  amountCents: number;
  method: string;
  reference: string;
  paidOn: string | null;
  submittedAt: string | null;
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
  charge: {
    description: string;
    term: string;
    balanceCents: number;
    dueDate: string | null;
  } | null;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/// An ISO instant rendered as the chapter's calendar day, for a date input.
function toDateInput(iso: string | null) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Phoenix",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function VerifyPaymentModal({
  submission,
  onClose,
  onReviewed,
}: {
  submission: QueuedSubmission;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  // Pre-filled with what the member said, deliberately — not today. An officer
  // clearing a week-old backlog shouldn't have to remember to backdate; the
  // fair outcome is the one that happens when they just click approve.
  const [paidOn, setPaidOn] = useState(toDateInput(submission.paidOn));
  const [amount, setAmount] = useState((submission.amountCents / 100).toFixed(2));
  const [reviewNote, setReviewNote] = useState("");
  const [mode, setMode] = useState<"verify" | "reject">("verify");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const name = submission.member
    ? `${submission.member.fName} ${submission.member.lName}`
    : "Unknown member";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (mode === "reject" && !reviewNote.trim()) {
      setError("Give them a reason — they'll see it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dues/submissions/${submission._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "verify"
            ? { action: "verify", paidOn, amountCents, reviewNote: reviewNote.trim() }
            : { action: "reject", reviewNote: reviewNote.trim() }
        ),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't save that");
      onReviewed(
        mode === "verify"
          ? `Verified ${money(amountCents)} from ${name}.`
          : `Sent ${name}'s claim back with a reason.`
      );
    } catch (err: any) {
      setError(err.message || "Couldn't save that");
    } finally {
      setSaving(false);
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
        className="modal-dialog modal-dialog-centered"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title">Review payment</h5>
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
                {name}{" "}
                <span className="text-muted fw-normal">
                  #{submission.member?.rollNo ?? "—"}
                </span>
              </div>
              <div className="small text-muted">
                {submission.charge?.description} &middot;{" "}
                {submission.charge?.term} &middot; claimed {money(submission.amountCents)}{" "}
                by {submission.method}
              </div>
              {submission.reference && (
                <div className="small text-muted">
                  Reference: {submission.reference}
                </div>
              )}
            </div>

            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${mode === "verify" ? "active" : ""}`}
                  onClick={() => setMode("verify")}
                >
                  Verify
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${mode === "reject" ? "active" : ""}`}
                  onClick={() => setMode("reject")}
                >
                  Reject
                </button>
              </li>
            </ul>

            {mode === "verify" && (
              <>
                <div className="mb-3">
                  <label className="form-label" htmlFor="verify-paid-on">
                    Date paid
                  </label>
                  <input
                    id="verify-paid-on"
                    type="date"
                    className="form-control"
                    value={paidOn}
                    onChange={(event) => setPaidOn(event.target.value)}
                    required
                  />
                  <div className="form-text">
                    Pre-filled with the date {submission.member?.fName ?? "they"}{" "}
                    gave. This is what decides whether they paid on time, so
                    leave it alone unless you know it&apos;s wrong &mdash;
                    it&apos;s not affected by how long this sat in the queue.
                    {submission.ageDays > 0 &&
                      ` (Filed ${submission.ageDays} day${submission.ageDays === 1 ? "" : "s"} ago.)`}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label" htmlFor="verify-amount">
                    Amount
                  </label>
                  <div className="input-group">
                    <span className="input-group-text">$</span>
                    <input
                      id="verify-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-control"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                  </div>
                  {submission.charge && (
                    <div className="form-text">
                      {money(submission.charge.balanceCents)} outstanding on this
                      charge.
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mb-1">
              <label className="form-label" htmlFor="verify-note">
                {mode === "reject" ? "Why?" : "Note"}{" "}
                {mode === "verify" && (
                  <span className="text-muted">(optional)</span>
                )}
              </label>
              <textarea
                id="verify-note"
                className="form-control"
                rows={2}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  mode === "reject"
                    ? "Couldn't find this in the Venmo history — can you send a screenshot?"
                    : ""
                }
              />
              {mode === "reject" && (
                <div className="form-text">
                  They&apos;ll see this, and both the claim and your reason stay
                  in their history.
                </div>
              )}
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
              type="submit"
              className={`btn ${mode === "verify" ? "btn-success" : "btn-danger"}`}
              disabled={saving}
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : mode === "verify" ? (
                "Verify payment"
              ) : (
                "Reject claim"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
