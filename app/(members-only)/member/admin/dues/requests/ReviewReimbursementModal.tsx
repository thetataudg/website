"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faReceipt } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/LoadingState";

export type QueuedReimbursement = {
  _id: string;
  amountCents: number;
  description: string;
  category: string;
  purchasedOn: string | null;
  receiptUrls: string[];
  ageDays: number;
  member: { rollNo: string; fName: string; lName: string } | null;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export default function ReviewReimbursementModal({
  reimbursement,
  onClose,
  onReviewed,
}: {
  reimbursement: QueuedReimbursement;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  const [mode, setMode] = useState<"approve" | "deny">("approve");
  const [amount, setAmount] = useState(
    (reimbursement.amountCents / 100).toFixed(2)
  );
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const name = reimbursement.member
    ? `${reimbursement.member.fName} ${reimbursement.member.lName}`
    : "Unknown member";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (mode === "deny" && !reviewNote.trim()) {
      setError("Give them a reason — they'll see it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reimbursements/${reimbursement._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "approve"
            ? { action: "approve", amountCents, reviewNote: reviewNote.trim() }
            : { action: "deny", reviewNote: reviewNote.trim() }
        ),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't save that");

      if (mode === "deny") {
        onReviewed(`Denied ${name}'s claim.`);
        return;
      }

      // Say what actually happened to the money, not just that it was
      // approved — where it landed is the part the treasurer needs to know.
      const applied = payload?.applied?.appliedCents ?? 0;
      const credit = payload?.creditCents ?? 0;
      const parts = [`Approved ${money(amountCents)} for ${name}.`];
      if (applied > 0) parts.push(`${money(applied)} came off what they owe.`);
      if (credit > 0) parts.push(`${money(credit)} is held as credit.`);
      onReviewed(parts.join(" "));
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
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title">Review claim</h5>
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
                  #{reimbursement.member?.rollNo ?? "—"}
                </span>
              </div>
              <div className="small text-muted">
                {reimbursement.description} &middot; {reimbursement.category}
                {reimbursement.purchasedOn &&
                  ` · bought ${new Date(reimbursement.purchasedOn).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" })}`}
              </div>
              <div className="small text-muted">
                Claimed {money(reimbursement.amountCents)} &middot; waiting{" "}
                {reimbursement.ageDays}d
              </div>
            </div>

            {reimbursement.receiptUrls.length > 0 ? (
              <div className="mb-3">
                <div className="small text-uppercase text-muted mb-2">
                  Receipts
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {reimbursement.receiptUrls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <FontAwesomeIcon icon={faReceipt} className="me-1" />
                      Receipt {index + 1}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="alert alert-warning py-2 small">
                No receipt attached. Worth asking for one before approving.
              </div>
            )}

            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${mode === "approve" ? "active" : ""}`}
                  onClick={() => setMode("approve")}
                >
                  Approve
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${mode === "deny" ? "active" : ""}`}
                  onClick={() => setMode("deny")}
                >
                  Deny
                </button>
              </li>
            </ul>

            {mode === "approve" && (
              <div className="mb-3">
                <label className="form-label" htmlFor="reimb-approve-amount">
                  Amount to approve
                </label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    id="reimb-approve-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-control"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </div>
                <div className="form-text">
                  Comes off what they owe first. Anything left over is held as
                  credit against their next dues, or you can pay it out from the
                  roster.
                </div>
              </div>
            )}

            <div className="mb-1">
              <label className="form-label" htmlFor="reimb-note">
                {mode === "deny" ? "Why?" : "Note"}{" "}
                {mode === "approve" && (
                  <span className="text-muted">(optional)</span>
                )}
              </label>
              <textarea
                id="reimb-note"
                className="form-control"
                rows={2}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  mode === "deny"
                    ? "This one needs a receipt before I can approve it."
                    : ""
                }
              />
              {mode === "deny" && (
                <div className="form-text">
                  They&apos;ll see this, and it stays in their history.
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
              className={`btn ${mode === "approve" ? "btn-success" : "btn-danger"}`}
              disabled={saving}
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : mode === "approve" ? (
                "Approve claim"
              ) : (
                "Deny claim"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
