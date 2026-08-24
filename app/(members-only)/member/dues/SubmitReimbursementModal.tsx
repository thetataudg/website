"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faPaperclip, faTrash } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../components/LoadingState";

const CATEGORIES = [
  { value: "rush", label: "Rush" },
  { value: "philanthropy", label: "Philanthropy" },
  { value: "brotherhood", label: "Brotherhood" },
  { value: "service", label: "Service" },
  { value: "professionalism", label: "Professionalism" },
  { value: "supplies", label: "Supplies" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Something else" },
];

function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type Receipt = { url: string; name: string };

export default function SubmitReimbursementModal({
  onClose,
  onFiled,
}: {
  onClose: () => void;
  onFiled: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("rush");
  const [purchasedOn, setPurchasedOn] = useState(todayLocal());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const invalid =
    !Number.isFinite(amountCents) || amountCents <= 0 || !description.trim();

  async function attach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const res = await fetch("/api/reimbursements/receipts", {
        method: "POST",
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't upload that");
      setReceipts((current) => [...current, { url: payload.url, name: file.name }]);
    } catch (err: any) {
      setError(err.message || "Couldn't upload that");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          description: description.trim(),
          category,
          purchasedOn,
          receiptUrls: receipts.map((receipt) => receipt.url),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't file that claim");
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't file that claim");
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
            <h5 className="modal-title">Claim a reimbursement</h5>
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
              For money you spent on the chapter&apos;s behalf. Once approved it
              comes off what you owe &mdash; and if you owe nothing, it&apos;s
              held as credit against your next dues.
            </p>

            <div className="mb-3">
              <label className="form-label" htmlFor="reimb-amount">
                How much did you spend?
              </label>
              <div className="input-group">
                <span className="input-group-text">$</span>
                <input
                  id="reimb-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="reimb-what">
                What was it for?
              </label>
              <input
                id="reimb-what"
                type="text"
                className="form-control"
                placeholder="Pizza for rush night"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="row g-3 mb-3">
              <div className="col-sm-6">
                <label className="form-label" htmlFor="reimb-category">
                  Category
                </label>
                <select
                  id="reimb-category"
                  className="form-select"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6">
                <label className="form-label" htmlFor="reimb-date">
                  When you bought it
                </label>
                <input
                  id="reimb-date"
                  type="date"
                  className="form-control"
                  value={purchasedOn}
                  max={todayLocal()}
                  onChange={(event) => setPurchasedOn(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-1">
              <label className="form-label">
                Receipts <span className="text-muted">(optional, but they get approved faster)</span>
              </label>
              {receipts.length > 0 && (
                <ul className="list-group mb-2">
                  {receipts.map((receipt) => (
                    <li
                      key={receipt.url}
                      className="list-group-item d-flex justify-content-between align-items-center py-2"
                    >
                      <span className="small text-truncate">{receipt.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0"
                        onClick={() =>
                          setReceipts((current) =>
                            current.filter((item) => item.url !== receipt.url)
                          )
                        }
                        aria-label={`Remove ${receipt.name}`}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInput}
                type="file"
                className="d-none"
                accept="image/*,.pdf"
                onChange={attach}
              />
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || receipts.length >= 8}
              >
                {uploading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPaperclip} className="me-1" />
                    Attach a receipt
                  </>
                )}
              </button>
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
              disabled={invalid || saving || uploading}
            >
              {saving ? <LoadingSpinner size="sm" /> : "Send to the treasurer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
