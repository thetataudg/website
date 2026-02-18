"use client";

import Link from "next/link";
import { Bungee } from "next/font/google";
import { useEffect, useMemo, useState } from "react";

const bungee = Bungee({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bungee",
  display: "swap",
});

const staticReasons = [
  "Planned updates that touch both the website and Discord configuration",
  "Data syncs between the recruitment system and member records",
  "Fixing unexpected issues without risking live conversations",
];

const expectations = [
  "Discord channels are temporarily limited so admins can complete sensitive changes",
  "You can still track progress on this page while we verify everything",
  "Lockdown ends as soon as the staff confirms the platform is stable",
];

const timezone = "America/Phoenix";

const formatArizona = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "Reopening soon";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pieces = [] as string[];
  if (hours) pieces.push(`${hours}h`);
  if (minutes) pieces.push(`${minutes}m`);
  pieces.push(`${seconds}s`);
  return pieces.join(" ");
};

type LockdownState = {
  active: boolean;
  reason: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
};

const initialLockdownState: LockdownState = {
  active: false,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
};

export default function LockdownPage() {
  const [state, setState] = useState<LockdownState>(initialLockdownState);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();
    const fetchState = async () => {
      try {
        const res = await fetch("/api/lockdown", { signal: controller.signal });
        if (!res.ok) throw new Error("Unable to load status");
        const payload = await res.json();
        setState({
          active: payload.active,
          reason: payload.reason,
          durationMinutes: payload.durationMinutes,
          startedAt: payload.startedAt,
          endsAt: payload.endsAt,
        });
      } catch (err) {
        console.error("Failed to load lockdown state", err);
      }
    };
    fetchState();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const countdown = useMemo(() => {
    if (!state.active || !state.endsAt) return null;
    const diff = new Date(state.endsAt).getTime() - now;
    return formatCountdown(diff);
  }, [state, now]);

  const reasonList = useMemo(() => {
    if (state.reason) return [state.reason, ...staticReasons];
    return staticReasons;
  }, [state.reason]);

  return (
    <main className="bg-[#120a0a] text-white min-h-screen pb-16">
      <section className="relative min-h-[60vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,137,137,0.25),_transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-xs uppercase tracking-[0.6em] text-[#f5d79a]">Theta Tau · Delta Gamma</p>
          <h1 className={`${bungee.variable} text-4xl sm:text-5xl lg:text-6xl text-[#b3202a]`}>Lockdown Mode</h1>
          <p className="max-w-3xl text-lg text-white/80">
            {state.active
              ? "The chapter temporarily paused member-only services while leadership performs sensitive updates and synchronizations."
              : "We keep this page live whenever we need a maintenance window - it will automatically refresh when the site returns to normal."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className="tt-button-secondary text-center">
              Head back to home
            </Link>
            <Link href="/rush" className="tt-button-primary text-center">
              Learn about rush
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-5xl px-6">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.4em] text-[#f5d79a]">Current status</p>
          <h2 className="mt-4 text-3xl font-semibold text-white">
            {state.active ? "Lockdown is in effect" : "Lockdown is not active"}
          </h2>
          <p className="mt-3 text-lg text-white/80">
            {state.active
              ? "Non-admin dashboards and member-only channels are temporarily paused. Follow this page and the Discord lockout alerts for updates."
              : "The site is fully available. If we need another maintenance window, this page will explain why."}
          </p>
          <div className="grid gap-6 md:grid-cols-3 mt-6">
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Limited channels</p>
              <p className="mt-2 text-xs text-white/60">Only the lockdown channel and select admin spaces remain visible.</p>
            </article>
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Planned purpose</p>
              <p className="mt-2 text-xs text-white/60">Updates, data syncs, or bug fixes that touch member state.</p>
            </article>
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Duration</p>
              <p className="mt-2 text-xs text-white/60">
                {state.durationMinutes > 0
                  ? `${state.durationMinutes} min planned window`
                  : state.active
                  ? "Open-ended until leadership confirms stability"
                  : "No maintenance scheduled"}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-5xl px-6">
        <div className="rounded-[36px] border border-[#b3202a]/30 bg-[#1c0c0c] p-8 shadow-[0_15px_35px_rgba(0,0,0,0.35)]">
          <h3 className="text-2xl font-semibold text-[#b3202a]">What you need to know</h3>
          <ul className="mt-4 space-y-3 text-white/80">
            {expectations.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#f5d79a]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-white/60">
            If you are a member who needs urgent access, contact an admin directly and we will
            follow up as soon as the maintenance window ends.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-5xl px-6">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.45em] text-[#f5d79a]">Lockdown reasons</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">
            {state.reason ? "Why the server is down right now" : "Recent updates"}
          </h3>
          <p className="mt-2 text-lg text-white/80">
            These short pauses let us stay proactive instead of reacting to problems after they happen.
          </p>
          <ul className="mt-4 space-y-3 text-white/90">
            {reasonList.map((reason, index) => (
              <li key={`${reason}-${index}`} className="flex items-start gap-3 text-base">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#b3202a]" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-4 text-sm text-white/70 md:grid-cols-2">
            <p>Started: {formatArizona(state.startedAt)}</p>
            <p>Scheduled end: {formatArizona(state.endsAt)}</p>
          </div>
          {state.active && countdown && (
            <p className="mt-4 text-lg font-semibold text-[#f4c12c]">Countdown: {countdown}</p>
          )}
          <p className="mt-3 text-sm text-white/60">
            We appreciate your patience while the team works through these changes. Follow this page for updates and return once the lockdown badge disappears.
          </p>
        </div>
      </section>
    </main>
  );
}
