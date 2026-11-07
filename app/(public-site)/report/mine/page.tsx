"use client";

// /report/mine: every report you filed or follow, in one place.
import * as React from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { DateTime } from "luxon";
import { Plus, Search } from "lucide-react";

import { bungee } from "../../../fonts";
import { useCachedJson } from "@/components/live/cachedFetch";
import { StatusPill } from "../ui";

type Mine = {
  ref: string;
  title: string;
  areaLabel: string;
  publicStatus: string;
  statusLabel: string;
  lastPublicActivityAt: string | null;
  createdAt: string;
  unread: boolean;
  isReporter: boolean;
};

const CLOSED = new Set(["fixed", "wont_fix", "duplicate", "closed_by_reporter"]);
const FILTERS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

export default function MyReportsPage() {
  return (
    <main className="min-h-screen bg-[#120a0a] px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-[720px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="tt-eyebrow">Technology committee</p>
            <h1 className={`${bungee.className} text-[32px] leading-tight text-[#b3202a] sm:text-[44px]`}>My reports</h1>
          </div>
          <Link href="/report" className="tt-button-primary shrink-0 gap-2 self-start sm:self-auto">
            <Plus className="size-4" aria-hidden="true" />
            New report
          </Link>
        </header>
        <SignedOut>
          <section className="tt-card tt-on-cream flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px]">Sign in to see your reports.</p>
            <Link href={`/sign-in?redirect_url=${encodeURIComponent("/report/mine")}`} className="tt-button-primary shrink-0">
              Sign in
            </Link>
          </section>
        </SignedOut>
        <SignedIn>
          <ReportList />
        </SignedIn>
      </div>
    </main>
  );
}

function ReportList() {
  const { data } = useCachedJson<Mine[]>("/api/report");
  const mine = data ?? null;
  const [filter, setFilter] = React.useState<Filter>("open");
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = (mine || []).filter((r) => {
    if (filter === "open" && CLOSED.has(r.publicStatus)) return false;
    if (filter === "closed" && !CLOSED.has(r.publicStatus)) return false;
    return !needle || r.title.toLowerCase().includes(needle) || r.ref.toLowerCase().includes(needle);
  });
  const count = (key: Filter) =>
    (mine || []).filter((r) => (key === "all" ? true : key === "closed" ? CLOSED.has(r.publicStatus) : !CLOSED.has(r.publicStatus))).length;

  return (
    <section aria-label="Your reports" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2" role="group" aria-label="Filter reports">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="tt-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              {mine ? <span className="ml-1 tabular-nums opacity-60">{count(f.key)}</span> : null}
            </button>
          ))}
        </div>
        {mine && mine.length > 5 ? (
          <div className="tt-search sm:w-60">
            <Search aria-hidden="true" />
            <input className="tt-input" aria-label="Search your reports" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        ) : null}
      </div>
      {mine === null ? (
        <div className="space-y-2" role="status" aria-label="Loading your reports">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/10" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="tt-card-dark space-y-3 text-center">
          <p className="text-sm text-white/60">
            {mine.length === 0 ? "You have not filed any reports yet." : needle ? "No reports match that search." : "Nothing here."}
          </p>
          {mine.length === 0 ? (
            <Link href="/report" className="tt-button-secondary">
              Report a problem
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="tt-card-dark divide-y divide-[rgba(251,246,220,0.08)] !p-0">
          {shown.map((r) => (
            <li key={r.ref}>
              <Link href={`/report/${r.ref}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
                <span className="flex w-2 shrink-0 justify-center">
                  {r.unread ? <span className="size-2 rounded-full bg-[#e2ab16]" aria-label="New update" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-white/55">
                    <span className="font-mono">{r.ref}</span> · {r.areaLabel}
                    {r.lastPublicActivityAt
                      ? ` · Updated ${DateTime.fromISO(r.lastPublicActivityAt).setZone("America/Phoenix").toFormat("LLL d")}`
                      : ""}
                    {!r.isReporter ? " · Following" : ""}
                  </span>
                </span>
                <StatusPill status={r.publicStatus} label={r.statusLabel} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
