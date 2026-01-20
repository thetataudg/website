"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

export type EventOption = {
  _id: string;
  name: string;
  startTime: string;
};

export type MinuteFormValues = {
  startTime: string;
  endTime: string;
  activesPresent: string;
  quorumRequired: boolean;
  executiveSummary: string;
  eventId?: string;
  file?: File | null;
};

type MinuteFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: MinuteFormValues) => void | Promise<void>;
  title?: string;
  submitLabel?: string;
  disabled?: boolean;
  showFileInput?: boolean;
  initialValues?: MinuteFormValues;
  events?: EventOption[];
};

const blankValues: MinuteFormValues = {
  startTime: "",
  endTime: "",
  activesPresent: "",
  quorumRequired: false,
  executiveSummary: "",
};

export default function MinuteFormModal({
  open,
  onClose,
  onSubmit,
  title = "Record new minutes",
  submitLabel = "Save minutes",
  disabled = false,
  showFileInput = false,
  initialValues,
  events,
}: MinuteFormModalProps) {
  const buildInitial = useCallback(
    () => ({
      startTime: initialValues?.startTime ?? "",
      endTime: initialValues?.endTime ?? "",
      activesPresent: initialValues?.activesPresent ?? "",
      quorumRequired: initialValues?.quorumRequired ?? false,
      executiveSummary: initialValues?.executiveSummary ?? "",
    }),
    [initialValues]
  );

  const [values, setValues] = useState<MinuteFormValues>(blankValues);
  const [file, setFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(initialValues?.eventId ?? "");

  useEffect(() => {
    setValues(buildInitial());
    setFile(null);
    setSelectedFileName("");
    setSelectedEventId(initialValues?.eventId ?? "");
  }, [buildInitial, initialValues, open]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, open]);

  const handleChange = (field: keyof MinuteFormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setSelectedFileName(nextFile?.name ?? "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    await Promise.resolve(
      onSubmit({
        ...values,
        file,
        eventId: selectedEventId || undefined,
      })
    );
  };

  if (!open) return null;

  return (
    <div className="minutes-modal" role="presentation">
      <div className="minutes-modal__backdrop" onClick={onClose} />
      <div
        className="minutes-modal__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="minutes-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="minutes-modal__header">
          <h2 id="minutes-modal-title" className="h5 mb-0">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary minutes-modal__close"
            aria-label="Close modal"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="minute-start" className="form-label">
              Meeting start
            </label>
            <input
              id="minute-start"
              type="datetime-local"
              className="form-control"
              value={values.startTime}
              onChange={(e) => handleChange("startTime", e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="minute-end" className="form-label">
              Meeting end
            </label>
            <input
              id="minute-end"
              type="datetime-local"
              className="form-control"
              value={values.endTime}
              onChange={(e) => handleChange("endTime", e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="minute-actives" className="form-label">
              Actives present
            </label>
            <input
              id="minute-actives"
              type="number"
              min={0}
              className="form-control"
              value={values.activesPresent}
              onChange={(e) => handleChange("activesPresent", e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="mb-3">
            <p className="form-label mb-1">Was quorum required?</p>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="quorum"
                id="quorum-yes"
                checked={values.quorumRequired === true}
                onChange={() => handleChange("quorumRequired", true)}
                disabled={disabled}
              />
              <label className="form-check-label" htmlFor="quorum-yes">
                Yes
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="quorum"
                id="quorum-no"
                checked={values.quorumRequired === false}
                onChange={() => handleChange("quorumRequired", false)}
                disabled={disabled}
              />
              <label className="form-check-label" htmlFor="quorum-no">
                No
              </label>
            </div>
          </div>

          {showFileInput && (
            <div className="mb-3">
              <label htmlFor="minute-file" className="form-label">
                Upload minutes (PDF)
              </label>
              <input
                id="minute-file"
                type="file"
                accept="application/pdf"
                className="form-control"
                onChange={handleFileChange}
                disabled={disabled}
              />
              <p className="form-text text-muted mb-0">
                Max file size 20 MB. PDF only.
              </p>
              {selectedFileName && (
                <p className="form-text small text-truncate mb-0">
                  Selected file: {selectedFileName}
                </p>
              )}
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="minute-summary" className="form-label">
              Executive summary
            </label>
            <textarea
              id="minute-summary"
              className="form-control"
              rows={4}
              value={values.executiveSummary}
              onChange={(e) => handleChange("executiveSummary", e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="minute-event" className="form-label">
              Link to event (optional)
            </label>
            <select
              id="minute-event"
              className="form-select"
              value={selectedEventId}
              onChange={(event) => {
                setSelectedEventId(event.target.value);
              }}
              disabled={disabled}
            >
              <option value="">Select an event</option>
              {events?.map((event) => (
                <option key={event._id} value={event._id}>
                  {event.name} –{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/Phoenix",
                  }).format(new Date(event.startTime))}
                </option>
              ))}
            </select>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-4">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={disabled}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
