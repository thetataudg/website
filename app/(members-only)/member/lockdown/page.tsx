"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

const computeCountdown = (timestamp: string | null, now: number) => {
  if (!timestamp) return "Awaiting schedule";
  const diff = new Date(timestamp).getTime() - now;
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
};

const initialState: LockdownState = {
  active: true,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
};

export default function MemberLockdownPage() {
  const [state, setState] = useState<LockdownState>(initialState);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const controller = new AbortController();
    const fetchState = async () => {
      try {
        const res = await fetch("/api/lockdown", { signal: controller.signal });
        if (!res.ok) throw new Error("Unable to load lockdown status");
        const payload = await res.json();
        setState({
          active: Boolean(payload.active),
          reason: payload.reason || "",
          durationMinutes: Number(payload.durationMinutes || 0),
          startedAt: payload.startedAt || null,
          endsAt: payload.endsAt || null,
        });
        window.localStorage.setItem("lockdown-active", payload.active ? "1" : "");
        const initialTheme = document.body?.dataset?.theme;
        setTheme(initialTheme === "dark" ? "dark" : "light");
      } catch (err) {
        console.error("Failed to fetch lockdown state", err);
      } finally {
        setLoading(false);
      }
    };
    fetchState();
    const observer = new MutationObserver(() => {
      const current = document.body?.dataset?.theme;
      setTheme(current === "dark" ? "dark" : "light");
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      observer.disconnect();
      clearInterval(timer);
    };
  }, []);

  const countdown = useMemo(() => computeCountdown(state.endsAt, now), [state.endsAt, now]);

  if (loading) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center ${
          theme === "dark" ? "bg-[#050611] text-white" : "bg-[#fdf4ec] text-[#2c1614]"
        }`}
      >
        <p className="text-lg font-semibold">Checking lockdown status…</p>
      </main>
    );
  }

  const containerClasses =
    theme === "dark"
      ? "bg-[#050611] text-[#f5dece] shadow-[0_20px_55px_rgba(0,0,0,0.75)] border border-[#222]"
      : "bg-white text-[#2c1614] shadow-[0_30px_60px_rgba(0,0,0,0.15)] border border-[#f1d6ba]";

  return (
    <main
      className={`min-h-screen flex items-center justify-center px-4 py-10 ${
        theme === "dark" ? "bg-[#03030a]" : "bg-gradient-to-b from-[#fef6ee] to-[#fff8ef]"
      }`}
    >
      <div className={`w-full max-w-3xl rounded-[32px] ${containerClasses} px-12 py-10`}>
        <section className="text-center">
          <p className="text-xs uppercase tracking-[0.5em] text-[#d99c45]">Member services paused</p>
          <h1 className="mt-3 text-4xl font-semibold">Site on Lockdown</h1>
          <p className={`${theme === "dark" ? "text-white/80" : "text-[#2a1b16]"}`}>
            Access to member-only areas is temporarily suspended while leadership performs updates. The site
            will reopen when the maintenance window ends.
          </p>
        </section>
        <section className="mt-8 space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-[#666] mb-1">Reason</p>
            <p className="text-lg font-semibold">{state.reason || "(none provided)"}</p>
          </div>
          <div className="flex flex-wrap gap-10 text-left">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#666]">Started</p>
              <p className="font-semibold">{formatArizona(state.startedAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#666]">Scheduled end</p>
              <p className="font-semibold">{formatArizona(state.endsAt)}</p>
            </div>
          </div>
          <p className="text-base font-semibold text-[#d99c45]">Countdown: {countdown}</p>
        </section>
        <section className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            className="tt-button-primary"
            onClick={() => {
              window.location.href = "/lockdown";
            }}
          >
            Lockdown status
          </button>
          <Link href="/" className="tt-button-secondary">
            Go to public home
          </Link>
        </section>
      </div>
    </main>
  );
}
