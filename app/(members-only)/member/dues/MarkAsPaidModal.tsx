"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../components/LoadingState";

export type PayableCharge = {
  _id: string;
  description: string;
  term: string;
  balanceCents: number;
};

const METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Something else" },
];

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

/// Today, as the member's own calendar sees it. `toISOString()` would hand back
/// a UTC day, which is the day before for anyone west of Greenwich after 5pm.
function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function MarkAsPaidModal({
  charge,
  onClose,
  onFiled,
}: {
  charge: PayableCharge;
  onClose: () => void;
  onFiled: () => void;
}) {
  const [amount, setAmount] = useState(centsToInput(charge.balanceCents));
  const [method, setMethod] = useState("venmo");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const overpaying = amountCents > charge.balanceCents;
  const invalid = !Number.isFinite(amountCents) || amountCents <= 0 || overpaying;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId: charge._id,
          amountCents,
          method,
          reference: reference.trim(),
          paidOn,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Couldn't file that payment");
      }
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't file that payment");
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
            <h5 className="modal-title">Report a payment</h5>
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
            <p className="text-muted small mb-3">
              {charge.description} &middot; {charge.term}
            </p>

            <div className="mb-3">
              <label className="form-label" htmlFor="paid-amount">
                How much did you pay?
              </label>
              <div className="input-group">
                <span className="input-group-text">$</span>
                <input
                  id="paid-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              {overpaying && (
                <div className="form-text text-danger">
                  That&apos;s more than the ${centsToInput(charge.balanceCents)}{" "}
                  still owed on this charge.
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="paid-on">
                When did you pay?
              </label>
              <input
                id="paid-on"
                type="date"
                className="form-control"
                value={paidOn}
                max={todayLocal()}
                onChange={(event) => setPaidOn(event.target.value)}
                required
              />
              <div className="form-text">
                The date the money actually left your account &mdash; not today,
                if you paid earlier. This is the date used to decide whether you
                paid on time, so it stands even if the treasurer takes a while
                to check it off.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="paid-method">
                How?
              </label>
              <select
                id="paid-method"
                className="form-select"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-1">
              <label className="form-label" htmlFor="paid-reference">
                Anything that helps them find it{" "}
                <span className="text-muted">(optional)</span>
              </label>
              <input
                id="paid-reference"
                type="text"
                className="form-control"
                placeholder="@your-venmo, check #204, gave it to Marcus"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={200}
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
              type="submit"
              className="btn btn-primary"
              disabled={invalid || saving}
            >
              {saving ? <LoadingSpinner size="sm" /> : "Send to the treasurer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
