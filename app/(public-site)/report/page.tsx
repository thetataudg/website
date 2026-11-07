"use client";

// /report: tell the Technology committee something is broken. Your reports
// live at /report/mine. Signed-out visitors see the intro and a sign-in link.
// Nothing on this page takes focus on its own.
import * as React from "react";
import { useCachedJson } from "@/components/live/cachedFetch";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ListChecks } from "lucide-react";

import { bungee } from "../../fonts";
import {
  AREAS,
  AREA_LABEL,
  SEVERITIES,
  SEVERITY_HELP,
  SEVERITY_LABEL,
  type BugArea,
  type BugSeverity,
} from "@/lib/bugs/constants";
import { ScreenshotPicker } from "./ui";

type Mine = {
  ref: string;
  title: string;
  areaLabel: string;
  publicStatus: string;
  statusLabel: string;
  lastPublicActivityAt: string | null;
  unread: boolean;
  isReporter: boolean;
};

const CLOSED = new Set(["fixed", "wont_fix", "duplicate", "closed_by_reporter"]);

export default function ReportPage() {
  return (
    <main className="min-h-screen bg-[#120a0a] px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-[720px] space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="tt-eyebrow">Technology committee</p>
            <h1 className={`${bungee.className} text-[32px] leading-tight text-[#b3202a] sm:text-[44px]`}>Report a problem</h1>
            <p className="text-[15px] text-white/65 sm:text-base">
              Something broken on the website, the app or the Discord bot? Tell us and we will follow up.
            </p>
          </div>
          <SignedIn>
            <MyReportsButton />
          </SignedIn>
        </header>
        <React.Suspense fallback={null}>
          <SignedOut>
            <SignedOutCard />
          </SignedOut>
          <SignedIn>
            <SignedInReport />
          </SignedIn>
        </React.Suspense>
      </div>
    </main>
  );
}

function SignedOutCard() {
  const search = useSearchParams();
  const back = `/report${search.toString() ? `?${search}` : ""}`;
  return (
    <section className="tt-card tt-on-cream flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px]">Reports are tied to your member account so we can reply.</p>
      <Link href={`/sign-in?redirect_url=${encodeURIComponent(back)}`} className="tt-button-primary shrink-0">
        Sign in to report
      </Link>
    </section>
  );
}

function MyReportsButton() {
  const { data } = useCachedJson<Mine[]>("/api/report");
  const open = (data || []).filter((r) => !CLOSED.has(r.publicStatus)).length;
  const unread = (data || []).some((r) => r.unread);
  return (
    <Link href="/report/mine" className="tt-button-secondary shrink-0 gap-2 self-start sm:self-auto">
      <ListChecks className="size-4" aria-hidden="true" />
      My reports
      {open ? (
        <span className="rounded-full bg-white/15 px-1.5 text-xs tabular-nums">{open}</span>
      ) : null}
      {unread ? <span className="size-2 rounded-full bg-[#e2ab16]" aria-label="New update" /> : null}
    </Link>
  );
}

function SignedInReport() {
  const { refresh } = useCachedJson<Mine[]>("/api/report");
  return <ReportForm onFiled={refresh} />;
}

function ReportForm({ onFiled }: { onFiled: () => void }) {
  const search = useSearchParams();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [area, setArea] = React.useState<BugArea>(search.get("from")?.startsWith("/member") ? "dashboard" : "website");
  const [severity, setSeverity] = React.useState<BugSeverity>("annoying");
  // Where they were when they opened this form. Only a suggestion: people
  // often notice a problem on one page and report it from another.
  const cameFrom = (search.get("from") || "").slice(0, 500);
  const [pageUrl, setPageUrl] = React.useState("");
  const [userAgent, setUserAgent] = React.useState("");
  const [appVersion, setAppVersion] = React.useState(search.get("appVersion") || "");
  const [shots, setShots] = React.useState<{ key: string; preview: string }[]>([]);
  const [similar, setSimilar] = React.useState<{ ref: string; title: string; statusLabel: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [filed, setFiled] = React.useState<string | null>(null);

  React.useEffect(() => setUserAgent(navigator.userAgent), []);

  // Your own open reports with a similar title, so you don't file twice.
  React.useEffect(() => {
    const q = title.trim();
    if (q.length < 4) {
      setSimilar([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/report/similar?q=${encodeURIComponent(q)}`);
      if (res.ok) setSimilar(await res.json());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [title]);

  if (filed) {
    return (
      <section className="tt-card tt-on-cream space-y-4" aria-live="polite">
        <div className="space-y-2">
          <h2 className="text-lg font-bold">Thanks, we got it</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-[#1b0f0f]/75">
            <span className="rounded-md bg-[#1b0f0f]/8 px-2 py-0.5 font-mono text-[13px] font-semibold text-[#1b0f0f]">{filed}</span>
            You will get a notification when it moves.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/report/${filed}`} className="tt-button-primary">
            View report
          </Link>
          <Link href="/report/mine" className="tt-button-secondary">
            All my reports
          </Link>
          <button
            type="button"
            className="tt-button-secondary"
            onClick={() => {
              setFiled(null);
              setTitle("");
              setDescription("");
              setShots([]);
            }}
          >
            Report another
          </button>
        </div>
      </section>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          area,
          severity,
          pageUrl,
          userAgent,
          appVersion,
          screenshotKeys: shots.map((s) => s.key),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not send the report");
      setFiled(json.ref);
      onFiled();
    } catch (err: any) {
      setError(err.message || "Could not send the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="tt-card tt-on-cream space-y-4" aria-label="Report a problem">
      <div>
        <label htmlFor="bug-title" className="tt-label">
          Title
        </label>
        <input
          id="bug-title"
          className="tt-input"
          value={title}
          maxLength={120}
          required
          placeholder="Calendar shows the wrong time for meetings"
          onChange={(e) => setTitle(e.target.value)}
        />
        {similar.length ? (
          <div className="mt-2 rounded-lg border border-[#e2ab16]/50 bg-[#e2ab16]/15 px-3 py-2 text-[13px]">
            <p className="font-semibold">You already reported something similar</p>
            <ul className="mt-1 space-y-0.5">
              {similar.map((s) => (
                <li key={s.ref}>
                  <Link href={`/report/${s.ref}`} className="text-[#7a0104] underline underline-offset-2">
                    {s.ref} {s.title}
                  </Link>{" "}
                  <span className="text-[#1b0f0f]/60">({s.statusLabel})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="bug-description" className="tt-label">
          What happened
        </label>
        <textarea
          id="bug-description"
          className="tt-input"
          value={description}
          required
          maxLength={10000}
          placeholder={"What did you do, step by step?\nWhat did you expect, and what happened instead?"}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bug-area" className="tt-label">
            Where
          </label>
          <select id="bug-area" className="tt-input" value={area} onChange={(e) => setArea(e.target.value as BugArea)}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bug-page" className="tt-label">
            Which page (optional)
          </label>
          <input
            id="bug-page"
            className="tt-input"
            value={pageUrl}
            maxLength={500}
            placeholder="/member/events"
            onChange={(e) => setPageUrl(e.target.value)}
          />
          {cameFrom && pageUrl !== cameFrom ? (
            <button
              type="button"
              onClick={() => setPageUrl(cameFrom)}
              className="mt-1.5 inline-flex max-w-full items-center gap-1 text-left text-[12px] text-[#1b0f0f]/70 hover:text-[#7a0104]"
            >
              <span className="shrink-0">Use the page you came from:</span>
              <span className="truncate font-mono font-semibold text-[#7a0104] underline underline-offset-2">{cameFrom}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <span id="bug-severity-label" className="tt-label">
          How bad is it
        </span>
        <div role="radiogroup" aria-labelledby="bug-severity-label" className="flex flex-wrap gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={severity === s}
              className="tt-chip"
              onClick={() => setSeverity(s)}
            >
              {SEVERITY_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="tt-help">{SEVERITY_HELP[severity]}</p>
      </div>

      <div>
        <span className="tt-label">Screenshots</span>
        <ScreenshotPicker id="bug-shots" keys={shots} onChange={setShots} />
        <p className="tt-help">Leave out passwords and anyone&apos;s personal info.</p>
      </div>

      <details className="text-[13px]">
        <summary className="cursor-pointer font-semibold text-[#1b0f0f]/75">Device details we will include</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bug-ua" className="tt-label">
              Browser and device
            </label>
            <input id="bug-ua" className="tt-input" value={userAgent} maxLength={500} onChange={(e) => setUserAgent(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bug-version" className="tt-label">
              App version
            </label>
            <input
              id="bug-version"
              className="tt-input"
              value={appVersion}
              maxLength={40}
              placeholder="Only for the iOS app"
              onChange={(e) => setAppVersion(e.target.value)}
            />
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-3 border-t border-[#1b0f0f]/10 pt-4 sm:flex-row sm:items-center sm:justify-end">
        {error ? <p className="text-[13px] font-semibold text-[#b3202a] sm:mr-auto">{error}</p> : null}
        <button type="submit" className="tt-button-primary" disabled={busy || !title.trim() || !description.trim()}>
          {busy ? "Sending..." : "Send report"}
        </button>
      </div>
    </form>
  );
}
