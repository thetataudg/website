"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingState, { LoadingSpinner } from "../../components/LoadingState";

const timezone = "America/Phoenix";
const formatArizona = (value: string | null) => {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCountdown = (endsAt: string | null) => {
  if (!endsAt) return "Awaiting schedule";
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Reopening soon";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
};

type LockdownState = {
  active: boolean;
  reason: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  createdBy: string;
};

const initialState: LockdownState = {
  active: false,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
  createdBy: "",
};

export default function LockdownControl() {
  const [state, setState] = useState<LockdownState>(initialState);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let aborted = false;
    const fetchState = async () => {
      try {
        const response = await fetch("/api/lockdown");
        if (!response.ok) throw new Error("Failed to load lockdown");
        const data = await response.json();
        if (aborted) return;
        setState({
          active: Boolean(data.active),
          reason: data.reason || "",
          durationMinutes: Number(data.durationMinutes || 0),
          startedAt: data.startedAt || null,
          endsAt: data.endsAt || null,
          createdBy: data.createdBy || "",
        });
      } catch (err) {
        console.error(err);
        if (!aborted) setError("Unable to load status.");
      } finally {
        if (!aborted) setLoading(false);
      }
    };
    fetchState();
    return () => {
      aborted = true;
    };
  }, []);

  const countdown = useMemo(() => formatCountdown(state.endsAt), [state.endsAt]);

  const submit = async (action: "engage" | "release") => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: any = { action };
      if (action === "engage") {
        payload.reason = reason;
        payload.durationMinutes = duration;
      }
      const res = await fetch("/api/admin/lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || body?.message || "Unable to update lockdown");
      }
      setState({
        active: Boolean(body.active),
        reason: body.reason || "",
        durationMinutes: Number(body.durationMinutes || 0),
        startedAt: body.startedAt || null,
        endsAt: body.endsAt || null,
        createdBy: body.createdBy || "",
      });
      setMessage(action === "engage" ? "Lockdown engaged." : "Lockdown released.");
    } catch (err: any) {
      console.error("Lockdown control failed", err);
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Checking lockdown status..." />;
  }

  return (
    <section className="bento-card admin-table-card">
      <div className="admin-members-header mb-3">
        <div>
          <h2 className="mb-1">Lockdown Control</h2>
          <p className="text-muted mb-0">
            {state.active ? "Lockdown is active" : "Lockdown is cleared"}
          </p>
        </div>
        <div className="text-end">
          <p className="text-muted mb-1">Countdown</p>
          <p className="fw-semibold mb-0">{countdown}</p>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-muted mb-1">Last updated by {state.createdBy || "leadership"}.</p>
        <p className="text-muted mb-1">
          Reason: <span className="fw-semibold">{state.reason || "(none provided)"}</span>
        </p>
        <p className="text-muted mb-0">
          Started {formatArizona(state.startedAt)} · Scheduled end {formatArizona(state.endsAt)}
        </p>
      </div>

      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Reason</label>
          <input
            type="text"
            className="form-control"
            value={reason}
            placeholder="Why are we locked down?"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label">Duration (minutes)</label>
          <input
            type="number"
            min={5}
            className="form-control"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3">
        <button
          className="btn btn-primary d-inline-flex align-items-center"
          onClick={() => submit("engage")}
          disabled={saving}
        >
          {saving && <LoadingSpinner size="sm" className="me-2" />}
          Engage Lockdown
        </button>
        <button
          className="btn btn-outline-secondary d-inline-flex align-items-center"
          onClick={() => submit("release")}
          disabled={saving || !state.active}
        >
          {saving && <LoadingSpinner size="sm" className="me-2" />}
          Release Lockdown
        </button>
      </div>

      {message && (
        <div className="alert alert-success mt-3" role="alert">
          {message}
        </div>
      )}
      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
