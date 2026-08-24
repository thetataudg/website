"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../components/LoadingState";

const METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Something else" },
];

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export default function PayOutCreditModal({
  member,
  onClose,
  onPaid,
}: {
  member: { memberId: string; rollNo: string; name: string; creditCents: number };
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const [amount, setAmount] = useState((member.creditCents / 100).toFixed(2));
  const [method, setMethod] = useState("venmo");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const tooMuch = amountCents > member.creditCents;
  const invalid = !Number.isFinite(amountCents) || amountCents <= 0 || tooMuch;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/credit/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.memberId,
          amountCents,
          method,
          reference: reference.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't record that");
      onPaid(
        `Paid ${money(amountCents)} to ${member.name}.` +
          (payload?.creditCents > 0
            ? ` ${money(payload.creditCents)} still owed to them.`
            : "")
      );
    } catch (err: any) {
      setError(err.message || "Couldn't record that");
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
            <h5 className="modal-title">Pay out credit</h5>
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
              The chapter owes <strong>{member.name}</strong> #{member.rollNo}{" "}
              {money(member.creditCents)}. Record it here once you&apos;ve
              actually sent the money &mdash; this doesn&apos;t move any funds.
            </p>

            <div className="mb-3">
              <label className="form-label" htmlFor="payout-amount">
                Amount
              </label>
              <div className="input-group">
                <span className="input-group-text">$</span>
                <input
                  id="payout-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              {tooMuch && (
                <div className="form-text text-danger">
                  That&apos;s more than the {money(member.creditCents)} owed.
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="payout-method">
                How did you send it?
              </label>
              <select
                id="payout-method"
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
              <label className="form-label" htmlFor="payout-reference">
                Reference <span className="text-muted">(optional)</span>
              </label>
              <input
                id="payout-reference"
                type="text"
                className="form-control"
                placeholder="@their-venmo, check #118"
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
            <button type="submit" className="btn btn-primary" disabled={invalid || saving}>
              {saving ? <LoadingSpinner size="sm" /> : "Record payout"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
