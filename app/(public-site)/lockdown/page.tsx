"use client";

import Link from "next/link";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bungee",
  display: "swap",
});

const reasons = [
  "Planned updates that touch both the website and Discord configuration",
  "Data syncs between the recruitment system and member records",
  "Fixing unexpected issues without risking live conversations",
];

const expectations = [
  "Discord channels are temporarily limited so admins can complete sensitive changes",
  "You can still track progress on this page while we verify everything",
  "Lockdown ends as soon as the staff confirms the platform is stable",
];

export default function LockdownPage() {
  return (
    <main className="bg-[#120a0a] text-white min-h-screen pb-16">
      <section className="relative min-h-[60vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,137,137,0.25),_transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-xs uppercase tracking-[0.6em] text-[#f5d79a]">Theta Tau · Delta Gamma</p>
          <h1 className={`${bungee.variable} text-4xl sm:text-5xl lg:text-6xl text-[#b3202a]`}>Lockdown Mode</h1>
          <p className="max-w-3xl text-lg text-white/80">
            The server is currently taking a short pause so that the leadership team can perform updates,
            run synchronizations, and keep the membership data in perfect shape.
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
          <p className="text-sm uppercase tracking-[0.4em] text-[#f5d79a]">Why is access paused?</p>
          <h2 className="mt-4 text-3xl font-semibold text-white">Keeping everyone and everything safe</h2>
          <p className="mt-3 text-lg text-white/80">
            Lockdown mode gives the admin team a quiet space to make configuration changes, sync fresh
            data, and repair any unexpected outages without disrupting the chapters who are online.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Limited channels</p>
              <p className="mt-2 text-xs text-white/60">Only the lockdown channel and select admin spaces remain visible.</p>
            </article>
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Why this happens</p>
              <p className="mt-2 text-xs text-white/60">We either update systems, synchronize records, or fix urgent bugs.</p>
            </article>
            <article className="rounded-2xl bg-white/10 p-4 text-sm text-white/70">
              <p className="text-white font-semibold">Expected length</p>
              <p className="mt-2 text-xs text-white/60">We reopen as soon as admins confirm the platform is stable.</p>
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

      <section className="mx-auto mt-10 max-w-5xl px-6 pb-10">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.45em] text-[#f5d79a]">Lockdown reasons</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">Why the server is down right now</h3>
          <p className="mt-2 text-lg text-white/80">
            These short pauses let us stay proactive instead of reacting to problems after they happen.
          </p>
          <ul className="mt-4 space-y-3 text-white/90">
            {reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-3 text-base">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#b3202a]" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-white/60">
            We appreciate your patience while the team works through these changes. Follow this page for updates and return once the lockdown badge disappears.
          </p>
        </div>
      </section>
    </main>
  );
}
