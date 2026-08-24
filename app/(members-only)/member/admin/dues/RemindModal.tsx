"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faBell, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../components/LoadingState";

type Preview = {
  wouldSendCount: number;
  cooldownCount: number;
  excludedCount: number;
  willSend: Array<{ rollNo: string; name: string; template: string; amountCents: number }>;
  skipped: Array<{ rollNo: string; name: string; reason: string }>;
};

const TEMPLATE_LABELS: Record<string, string> = {
  assigned: "Dues assigned",
  upcoming: "Due in a week",
  due_soon: "Due tomorrow",
  due_today: "Due today",
  overdue: "Overdue",
  installment_due: "Plan installment",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/// The count before the send, not after.
///
/// A treasurer who presses "remind everyone" and only then learns it went to
/// eleven people has been surprised by their own chapter's inbox. The dry run
/// costs one request and turns the cooldown from something that fights them
/// into something they can see working.
export default function RemindModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/reminders");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't work out who to remind");
      setPreview(payload);
    } catch (err: any) {
      setError(err.message || "Couldn't work out who to remind");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't send the reminders");
      onSent(payload.summary || "Reminders sent.");
    } catch (err: any) {
      setError(err.message || "Couldn't send the reminders");
    } finally {
      setSending(false);
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
            <h5 className="modal-title">Send reminders</h5>
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
            {loading ? (
              <div className="text-center py-4">
                <LoadingSpinner />
              </div>
            ) : preview ? (
              <>
                <p className="mb-3">
                  <strong>{preview.wouldSendCount}</strong>{" "}
                  {preview.wouldSendCount === 1 ? "person" : "people"} will be
                  reminded.
                </p>

                {(preview.cooldownCount > 0 || preview.excludedCount > 0) && (
                  <div className="alert alert-light border d-flex align-items-start gap-2 py-2">
                    <FontAwesomeIcon icon={faCircleInfo} className="mt-1" />
                    <div className="small">
                      {preview.cooldownCount > 0 && (
                        <div>
                          {preview.cooldownCount} already had this reminder in
                          the last 24 hours and won&apos;t get another.
                        </div>
                      )}
                      {preview.excludedCount > 0 && (
                        <div>
                          {preview.excludedCount} are waiting on you or already
                          up to date &mdash; nobody gets chased for money
                          they&apos;ve already dealt with.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {preview.willSend.length > 0 && (
                  <div className="table-responsive mb-2">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Message</th>
                          <th className="text-end">Owed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.willSend.map((row) => (
                          <tr key={row.rollNo}>
                            <td>
                              <div className="small fw-semibold">{row.name}</div>
                              <div className="text-muted" style={{ fontSize: 11 }}>
                                #{row.rollNo}
                              </div>
                            </td>
                            <td className="small">
                              {TEMPLATE_LABELS[row.template] ?? row.template}
                            </td>
                            <td className="text-end small fw-semibold">
                              {money(row.amountCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {preview.skipped.length > 0 && (
                  <details className="small text-muted">
                    <summary>Who isn&apos;t being reminded, and why</summary>
                    <ul className="mt-2 mb-0 ps-3">
                      {preview.skipped.map((row) => (
                        <li key={row.rollNo}>
                          {row.name} &mdash; {row.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : null}

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
              className="btn btn-primary"
              disabled={sending || loading || !preview?.wouldSendCount}
              onClick={send}
            >
              {sending ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <FontAwesomeIcon icon={faBell} className="me-2" />
                  Remind {preview?.wouldSendCount ?? 0}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
