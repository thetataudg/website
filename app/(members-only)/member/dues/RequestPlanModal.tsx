"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../components/LoadingState";
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  MIN_INSTALLMENT_CENTS,
  buildSchedule,
  maxInstallmentsFor,
} from "@/lib/planMath";

export type PlannableCharge = {
  _id: string;
  description: string;
  balanceCents: number;
  dueDate: string | null;
};

export type PlannableBalance = {
  term: string;
  /// Everything owed that no live plan already covers. The member chooses which
  /// of these this plan is for — a $200 dues charge and a $500 trip deposit are
  /// two different conversations and can be two different schedules.
  charges: PlannableCharge[];
};

function money(cents: number) {
  const abs = Math.abs(cents);
  return (abs / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/// The one screen worth obsessing over.
///
/// The member is agreeing to concrete dates and amounts, so they see concrete
/// dates and amounts — recomputed as they move the count, from the same
/// calculator the server uses. Counts the balance can't support are greyed out
/// rather than accepted and then rejected, because being told "no" after
/// choosing is how a member decides the app is arguing with them.
export default function RequestPlanModal({
  balance,
  onClose,
  onFiled,
}: {
  balance: PlannableBalance;
  onClose: () => void;
  onFiled: () => void;
}) {
  // Everything is selected to start with: covering the lot is the common case,
  // and a member who wants one charge separated out can untick the rest.
  const [selected, setSelected] = useState<string[]>(() =>
    balance.charges.map((charge) => charge._id)
  );
  const [requestNote, setRequestNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => balance.charges.filter((charge) => selected.includes(charge._id)),
    [balance.charges, selected]
  );
  const totalCents = chosen.reduce((sum, charge) => sum + charge.balanceCents, 0);
  // The schedule anchors on the earliest deadline among the charges chosen, so
  // ticking a charge with a nearer due date pulls the whole schedule forward.
  const anchorDueDate =
    chosen
      .map((charge) => charge.dueDate)
      .filter(Boolean)
      .sort()[0] ?? null;

  const maxCount = maxInstallmentsFor(totalCents);
  const [count, setCount] = useState(3);
  // Narrowing the selection can put the current count out of range; clamp it
  // rather than letting the preview show a schedule the server would refuse.
  const effectiveCount = Math.min(Math.max(count, MIN_INSTALLMENTS), Math.max(maxCount, MIN_INSTALLMENTS));

  const schedule = useMemo(
    () => (totalCents > 0 ? buildSchedule(totalCents, effectiveCount, anchorDueDate) : []),
    [totalCents, anchorDueDate, effectiveCount]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || maxCount < MIN_INSTALLMENTS || !chosen.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: balance.term,
          chargeIds: chosen.map((charge) => charge._id),
          installments: effectiveCount,
          requestNote: requestNote.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't send that request");
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't send that request");
    } finally {
      setSaving(false);
    }
  }

  const nothingChosen = chosen.length === 0;
  const tooSmall = !nothingChosen && maxCount < MIN_INSTALLMENTS;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );

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
            <h5 className="modal-title">Request a payment plan</h5>
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
              {money(totalCents)} owed &middot; {balance.term}
            </p>

            {balance.charges.length > 1 && (
              <div className="mb-3">
                <div className="text-uppercase small text-muted mb-2">
                  What should this plan cover?
                </div>
                <ul className="list-group">
                  {balance.charges.map((charge) => (
                    <li key={charge._id} className="list-group-item py-2">
                      <label className="d-flex justify-content-between align-items-center gap-2 mb-0">
                        <span className="d-flex align-items-center gap-2">
                          <input
                            type="checkbox"
                            className="form-check-input mt-0"
                            checked={selected.includes(charge._id)}
                            onChange={() => toggle(charge._id)}
                          />
                          <span>
                            {charge.description}
                            {charge.dueDate && (
                              <span className="small text-muted d-block">
                                due {dayLabel(new Date(charge.dueDate))}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="fw-semibold">
                          {money(charge.balanceCents)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="form-text">
                  Anything you leave out stays owed in full &mdash; you can put
                  it on its own plan later, as long as you ask before its due
                  date.
                </div>
              </div>
            )}

            {nothingChosen ? (
              <div className="alert alert-warning mb-0">
                Pick at least one charge for this plan to cover.
              </div>
            ) : tooSmall ? (
              <div className="alert alert-warning mb-0">
                {money(totalCents)} is too small to spread out &mdash;
                installments can&apos;t be under {money(MIN_INSTALLMENT_CENTS)}.
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label" htmlFor="plan-count">
                    How many months do you need?
                  </label>
                  <div className="btn-group w-100" role="group" id="plan-count">
                    {Array.from(
                      { length: MAX_INSTALLMENTS - MIN_INSTALLMENTS + 1 },
                      (_, index) => index + MIN_INSTALLMENTS
                    ).map((option) => {
                      const allowed = option <= maxCount;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`btn btn-sm ${
                            option === effectiveCount
                              ? "btn-primary"
                              : "btn-outline-secondary"
                          }`}
                          disabled={!allowed}
                          title={
                            allowed
                              ? undefined
                              : `${money(totalCents)} over ${option} months would be under the ${money(MIN_INSTALLMENT_CENTS)} minimum`
                          }
                          onClick={() => setCount(option)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {maxCount < MAX_INSTALLMENTS && (
                    <div className="form-text">
                      {money(totalCents)} can be split{" "}
                      {maxCount} ways at most &mdash; no installment can be under{" "}
                      {money(MIN_INSTALLMENT_CENTS)}.
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <div className="text-uppercase small text-muted mb-2">
                    Your schedule
                  </div>
                  <ul className="list-group list-group-flush border rounded">
                    {schedule.map((installment) => (
                      <li
                        key={installment.seq}
                        className="list-group-item d-flex justify-content-between align-items-center py-2"
                      >
                        <span className="text-muted small">
                          {dayLabel(installment.dueDate)}
                        </span>
                        <span className="fw-semibold">
                          {money(installment.amountCents)}
                        </span>
                      </li>
                    ))}
                    <li className="list-group-item d-flex justify-content-between align-items-center py-2 bg-body-tertiary">
                      <span className="small">Total</span>
                      <span className="fw-semibold">
                        {money(
                          schedule.reduce((sum, i) => sum + i.amountCents, 0)
                        )}
                      </span>
                    </li>
                  </ul>
                  <div className="form-text d-flex align-items-start gap-2 mt-2">
                    <FontAwesomeIcon icon={faCircleInfo} className="mt-1" />
                    <span>
                      Installments are allowed to run past your due date &mdash;
                      what matters is that you asked before it. Nothing is
                      agreed until the treasurer approves it, and you won&apos;t
                      be marked late while you wait.
                    </span>
                  </div>
                </div>

                <div className="mb-1">
                  <label className="form-label" htmlFor="plan-note">
                    Anything the treasurer should know{" "}
                    <span className="text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="plan-note"
                    className="form-control"
                    rows={2}
                    maxLength={500}
                    placeholder="Paycheque lands the 15th, so the 1st is tight"
                    value={requestNote}
                    onChange={(event) => setRequestNote(event.target.value)}
                  />
                </div>
              </>
            )}

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
              disabled={tooSmall || nothingChosen || saving}
            >
              {saving ? <LoadingSpinner size="sm" /> : "Send to the treasurer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
