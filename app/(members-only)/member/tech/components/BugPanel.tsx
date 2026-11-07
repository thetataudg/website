"use client";

// The bug report behind a task: the reporter's thread (read-only) and a
// composer whose "Reply to reporter" switch starts off. An accidental public
// reply is the main privacy risk, so the default is an internal note.
import * as React from "react";
import Link from "next/link";
import { Bug, ChevronDown, ExternalLink, MessageSquare } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useLive } from "@/components/live/useLive";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { renderMarkdown } from "@/lib/markdownSafe";
import { TASK_ZONE } from "@/lib/tasks/constants";
import { Composer, Section } from "./TaskDetail";

type Data = {
  report: {
    ref: string;
    title: string;
    statusLabel: string;
    severityLabel: string;
    areaLabel: string;
    pageUrl: string;
    userAgent: string;
    appVersion: string;
    screenshots: string[];
    staff?: { reporterName: string };
  };
  messages: {
    id: string;
    visibility: "public" | "internal";
    authorName: string;
    body: string;
    screenshots: string[];
    createdAt: string;
  }[];
};

export function BugPanel({ bugReportId }: { bugReportId: string }) {
  const [data, setData] = React.useState<Data | null>(null);
  const [toReporter, setToReporter] = React.useState(false);
  const [threadOpen, setThreadOpen] = React.useState(false);
  const load = React.useCallback(async () => {
    const res = await fetch(`/api/report/${bugReportId}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [bugReportId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  useLive("tasks", () => void load());

  if (!data) return null;
  const { report, messages } = data;
  const device = friendlyDevice(report.userAgent);

  return (
    <Section
      title={`Bug report ${report.ref}`}
      icon={Bug}
      aside={
        <Link href={`/report/${report.ref}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Open report
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      }
    >
      <div className="space-y-3 rounded-xl border border-border p-3">
        <dl className="m-0 grid grid-cols-[6.5rem,1fr] gap-x-2 gap-y-1.5 text-xs">
          <dt className="px-1 text-muted-foreground">Reported by</dt>
          <dd className="m-0 font-medium text-foreground">{report.staff?.reporterName || "A member"}</dd>
          <dt className="px-1 text-muted-foreground">Where</dt>
          <dd className="m-0 text-foreground">
            {report.areaLabel}
            {report.pageUrl ? <span className="ml-1.5 break-all font-mono text-[11px] text-muted-foreground">{report.pageUrl}</span> : null}
          </dd>
          <dt className="px-1 text-muted-foreground">They said</dt>
          <dd className="m-0 text-foreground">{report.severityLabel}</dd>
          {device ? (
            <>
              <dt className="px-1 text-muted-foreground">Device</dt>
              <dd className="m-0 text-foreground" title={report.userAgent}>
                {device}
                {report.appVersion ? ` · app ${report.appVersion}` : ""}
              </dd>
            </>
          ) : null}
          <dt className="px-1 text-muted-foreground">Reporter sees</dt>
          <dd className="m-0">
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
              {report.statusLabel}
            </span>
          </dd>
        </dl>
        {report.screenshots.length ? (
          <div className="flex flex-wrap gap-2">
            {report.screenshots.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Screenshot from the report" className="size-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}

        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setThreadOpen((o) => !o)}
            aria-expanded={threadOpen}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
            {messages.length ? `Conversation (${messages.length})` : "Reply to the reporter or add a note"}
            <ChevronDown className={cn("ml-auto size-3.5 transition-transform", threadOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {threadOpen ? (
            <div className="mt-2 space-y-3">
              {messages.length ? (
                <ol className="m-0 max-h-72 list-none space-y-2 overflow-y-auto p-0">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm",
                        m.visibility === "internal" ? "border border-dashed border-border" : "bg-muted"
                      )}
                    >
                      <p className="m-0 mb-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{m.authorName}</span> ·{" "}
                        {DateTime.fromISO(m.createdAt).setZone(TASK_ZONE).toFormat("LLL d, h:mm a")}
                        {m.visibility === "internal" ? " · Internal" : " · Reporter can see this"}
                      </p>
                      {m.body ? <div className="tt-md break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} /> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
      <Composer
        members={[]}
        onPosted={load}
        placeholder={toReporter ? "Reply to the reporter" : "Internal note on the report"}
        submitLabel={toReporter ? "Send to reporter" : "Add note"}
        post={async (body) => {
          const res = await fetch(`/api/report/${bugReportId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body, visibility: toReporter ? "public" : "internal" }),
          });
          if (!res.ok) toast.error((await res.json().catch(() => ({}))).error || "Could not send");
          else setToReporter(false);
          return res.ok;
        }}
        extra={
          <div className="flex items-center gap-2">
            <Switch id={`to-reporter-${bugReportId}`} checked={toReporter} onCheckedChange={setToReporter} />
            <Label htmlFor={`to-reporter-${bugReportId}`} className={cn(toReporter && "text-primary")}>
              Reply to reporter
            </Label>
          </div>
        }
      />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/// "Chrome 157 on macOS" from a user agent string. Empty when unknown.
function friendlyDevice(ua: string): string {
  if (!ua) return "";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser =
    (/Edg\/(\d+)/.exec(ua) && `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`) ||
    (/CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua) && `Chrome ${(/CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua)![1] || /Chrome\/(\d+)/.exec(ua)![1])}`) ||
    (/Firefox\/(\d+)/.exec(ua) && `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`) ||
    (/Version\/(\d+).*Safari/.exec(ua) && `Safari ${/Version\/(\d+)/.exec(ua)![1]}`) ||
    (/ThetaTau|CFNetwork/.test(ua) ? "the app" : "");
  if (!browser && !os) return ua.slice(0, 60);
  return [browser, os && `on ${os}`].filter(Boolean).join(" ");
}
