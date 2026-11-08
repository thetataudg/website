"use client";

// /report/TTDG-R2741: one report, as its reporter (or a subscriber) sees it. Never
// shows internal notes, task details or who is working on it; staff replies
// are signed "Technology committee". The tech committee sees the same page
// plus internal notes, and works the report from Triage.
import * as React from "react";
import { useCachedJson } from "@/components/live/cachedFetch";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { DateTime } from "luxon";
import { ArrowLeft, Check } from "lucide-react";

import { bungee } from "../../../fonts";
import { renderMarkdown } from "@/lib/markdownSafe";
import { ScreenshotPicker, StatusPill } from "../ui";

type Report = {
  ref: string;
  title: string;
  description: string;
  areaLabel: string;
  severityLabel: string;
  pageUrl: string;
  screenshots: string[];
  publicStatus: string;
  statusLabel: string;
  needsInfo: boolean;
  createdAt: string;
  isReporter: boolean;
};
type Message = {
  id: string;
  visibility: "public" | "internal";
  authorRole: "staff" | "reporter";
  authorName: string;
  body: string;
  screenshots: string[];
  createdAt: string;
};

const STEPS = [
  { key: "received", label: "Received", help: "We have your report and will look at it soon." },
  { key: "triaged", label: "Accepted", help: "We looked at it and added it to our to-do list." },
  { key: "in_progress", label: "In progress", help: "Someone is working on it now." },
  { key: "fixed", label: "Fixed", help: "It is fixed. Reopen it if you still see the problem." },
];
const ENDINGS: Record<string, string> = {
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  closed_by_reporter: "Closed",
};

const when = (iso: string) => DateTime.fromISO(iso).setZone("America/Phoenix").toFormat("LLL d, h:mm a");

export default function ReportDetailPage({ params }: { params: { ref: string } }) {
  return (
    <main className="min-h-screen bg-[#120a0a] px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-[720px] space-y-5">
        <Link href="/report/mine" className="inline-flex items-center gap-1.5 text-[13px] text-[#f5d79a] hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All my reports
        </Link>
        <SignedOut>
          <section className="tt-card tt-on-cream flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px]">Sign in to see this report.</p>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/report/${params.ref}`)}`}
              className="tt-button-primary shrink-0"
            >
              Sign in
            </Link>
          </section>
        </SignedOut>
        <SignedIn>
          <ReportDetail refId={decodeURIComponent(params.ref)} />
        </SignedIn>
      </div>
    </main>
  );
}

function ReportDetail({ refId }: { refId: string }) {
  type Detail = { report: Report; messages: Message[]; isStaff: boolean };
  const { data: cached, error: loadError, refresh: load, mutate } = useCachedJson<Detail>(
    `/api/report/${encodeURIComponent(refId)}`
  );
  const data = cached ?? null;
  const setData = mutate;
  const error = loadError
    ? loadError === "Not found"
      ? "This report does not exist, or it is not yours to see."
      : loadError
    : "";

  if (error && !data) return <p className="tt-card tt-on-cream text-[15px]">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading the report">
        <div className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
        <div className="h-6 w-80 max-w-full animate-pulse rounded-full bg-white/10" />
        <div className="h-36 animate-pulse rounded-2xl bg-white/10" />
      </div>
    );
  }
  const { report, messages, isStaff } = data;
  const closed = Boolean(ENDINGS[report.publicStatus]);

  const act = async (action: string) => {
    const res = await fetch(`/api/report/${encodeURIComponent(refId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setData(await res.json());
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <p className="font-mono text-[13px] text-[#f5d79a]">{report.ref}</p>
        <h1 className={`${bungee.className} text-[26px] leading-tight text-[#b3202a] sm:text-[32px]`}>{report.title}</h1>
        <p className="text-[13px] text-white/60">
          {report.areaLabel} · {report.severityLabel} · Filed {when(report.createdAt)}
        </p>
      </header>

      <Stepper status={report.publicStatus} label={report.statusLabel} />
      {report.needsInfo ? (
        <p className="rounded-lg bg-[#e2ab16] px-3 py-2 text-[13px] font-semibold text-[#1b0f0f]">
          The Technology committee asked for more information. Reply below.
        </p>
      ) : null}

      <section className="tt-card tt-on-cream space-y-3">
        <div
          className="tt-md space-y-2 break-words text-[15px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(report.description) }}
        />
        {report.pageUrl ? <p className="text-[13px] text-[#1b0f0f]/65">Page: {report.pageUrl}</p> : null}
        <Shots urls={report.screenshots} />
      </section>

      <section aria-labelledby="thread" className="space-y-3">
        <h2 id="thread" className="text-lg font-bold text-[#f5d79a]">
          Updates
        </h2>
        {messages.length === 0 ? <p className="text-sm text-white/60">No replies yet.</p> : null}
        <ol className="space-y-3">
          {messages.map((m) => {
            const internal = m.visibility === "internal";
            const staff = m.authorRole === "staff";
            return (
              <li
                key={m.id}
                className={`space-y-1.5 py-1 pl-3 ${
                  internal
                    ? "rounded-lg border border-dashed border-[#f5d79a]/50 py-2 pr-3"
                    : staff
                      ? "border-l-2 border-[#e2ab16]"
                      : "border-l-2 border-transparent"
                }`}
              >
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-white/55">
                  <span className="font-semibold text-white/80">{m.authorName}</span>
                  <span>{when(m.createdAt)}</span>
                  {internal ? <span className="font-semibold text-[#f5d79a]">Internal note</span> : null}
                </p>
                {m.body ? (
                  <div className="tt-md space-y-2 break-words text-sm text-white/90" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
                ) : null}
                <Shots urls={m.screenshots} />
              </li>
            );
          })}
        </ol>
        {!closed || report.isReporter ? <Reply refId={refId} isStaff={isStaff} onPosted={load} /> : null}
      </section>

      {report.isReporter ? (
        <div className="flex flex-wrap gap-3">
          {report.publicStatus === "closed_by_reporter" ? (
            <button type="button" className="tt-button-secondary" onClick={() => act("reopen")}>
              Reopen
            </button>
          ) : !closed ? (
            <button type="button" className="tt-button-secondary" onClick={() => act("close")}>
              No longer an issue
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stepper({ status, label }: { status: string; label: string }) {
  const ending = ENDINGS[status];
  const reached = ending ? -1 : STEPS.findIndex((s) => s.key === status);
  if (ending) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-white/60">Status</span>
        <StatusPill status={status} label={label} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={`Status: ${label}`}>
      {STEPS.map((step, i) => {
        const done = i <= reached;
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${
                done ? "bg-[#e2ab16] text-[#1b0f0f]" : "bg-white/10 text-white/60"
              }`}
              aria-current={i === reached ? "step" : undefined}
            >
              {done ? <Check className="size-3" aria-hidden="true" /> : null}
              {step.label}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px w-4 bg-white/25" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
    {reached >= 0 ? <p className="text-[13px] text-white/60">{STEPS[reached].help}</p> : null}
    </div>
  );
}

function Shots({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-lg border border-white/15 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Attached screenshot" className="size-full object-cover" />
        </a>
      ))}
    </div>
  );
}

function Reply({ refId, isStaff, onPosted }: { refId: string; isStaff: boolean; onPosted: () => void }) {
  const [body, setBody] = React.useState("");
  const [shots, setShots] = React.useState<{ key: string; preview: string }[]>([]);
  const [internal, setInternal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/report/${encodeURIComponent(refId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        visibility: isStaff && internal ? "internal" : "public",
        screenshotKeys: shots.map((s) => s.key),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not send");
      return;
    }
    setBody("");
    setShots([]);
    onPosted();
  };

  return (
    <form onSubmit={submit} className="tt-card tt-on-cream space-y-3">
      <label htmlFor="reply" className="sr-only">
        Reply
      </label>
      <textarea
        id="reply"
        className="tt-input"
        value={body}
        maxLength={10000}
        placeholder="Add details or reply"
        onChange={(e) => setBody(e.target.value)}
      />
      <ScreenshotPicker id="reply-shots" keys={shots} onChange={setShots} />
      {isStaff ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[#7a0104]" />
          Internal note (the reporter will not see it)
        </label>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {error ? <p className="text-[13px] font-semibold text-[#b3202a] sm:mr-auto">{error}</p> : null}
        <button type="submit" className="tt-button-primary" disabled={busy || (!body.trim() && !shots.length)}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
