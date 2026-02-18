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
    <section className="bento-card admin-lockdown-card">
      <header className="admin-lockdown-card__header">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[#f5d79a]">Lockdown Control</p>
          <h3 className="mt-1 text-2xl font-semibold">
            {state.active ? "Lockdown is active" : "Lockdown is cleared"}
          </h3>
        </div>
        <p className="text-sm text-white/70">
          Countdown: <span className="font-semibold text-[#f4c12c]">{countdown}</span>
        </p>
      </header>
      <div className="admin-lockdown-card__body">
        <p className="text-sm text-white/80">Last updated by {state.createdBy || "leadership"}.</p>
        <p className="text-sm text-white/70">
          Reason: <span className="font-semibold text-white">{state.reason || "(none provided)"}</span>
        </p>
        <p className="text-sm text-white/70">
          Started {formatArizona(state.startedAt)} · Scheduled end {formatArizona(state.endsAt)}
        </p>
        <div className="flex flex-col gap-3 mt-4">
          <label className="text-sm font-semibold">Reason</label>
          <input
            type="text"
            className="form-control"
            value={reason}
            placeholder="Why are we locked down?"
            onChange={(event) => setReason(event.target.value)}
          />
          <label className="text-sm font-semibold">Duration (minutes)</label>
          <input
            type="number"
            min={5}
            className="form-control"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </div>
        <div className="admin-lockdown-card__actions">
          <button
            className="tt-button-primary"
            onClick={() => submit("engage")}
            disabled={saving}
          >
            {saving ? <LoadingSpinner size="sm" /> : "Engage Lockdown"}
          </button>
          <button
            className="tt-button-secondary"
            onClick={() => submit("release")}
            disabled={saving || !state.active}
          >
            {saving ? <LoadingSpinner size="sm" /> : "Release Lockdown"}
          </button>
        </div>
        {message && <p className="mt-2 text-sm text-green-300">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </section>
  );
}
