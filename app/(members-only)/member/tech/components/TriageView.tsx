"use client";

// Incoming bug reports. Accept creates a linked task (whose status then drives
// what the reporter sees); Duplicate of, Won't fix and Need info answer the
// reporter without one.
import * as React from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/markdownSafe";
import { TASK_ZONE } from "@/lib/tasks/constants";
import { AREAS, AREA_LABEL, SEVERITIES, SEVERITY_LABEL } from "@/lib/bugs/constants";
import { ArrowUpDown, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "./MultiSelect";
import { RowsSkeleton } from "./Skeletons";
import { useCachedJson } from "@/components/live/cachedFetch";
import { useTracker } from "./TrackerProvider";

type TriageRow = {
  ref: string;
  title: string;
  description: string;
  area: string;
  areaLabel: string;
  severity: string;
  severityLabel: string;
  pageUrl: string;
  userAgent: string;
  appVersion: string;
  screenshots: string[];
  publicStatus: string;
  statusLabel: string;
  needsInfo: boolean;
  createdAt: string;
  staff?: { reporterName: string; reporterStatus: string; taskKey: string | null; duplicateOf: string | null };
};

type SortKey = "newest" | "oldest" | "severity";
const SEVERITY_RANK: Record<string, number> = { blocker: 0, annoying: 1, minor: 2, idea: 3 };

type Action = { kind: "duplicate" | "wont_fix" | "need_info"; row: TriageRow } | null;

export function TriageView() {
  const { openTask } = useTracker();
  const [view, setView] = React.useState<"open" | "all">("open");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<Action>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const { data, error, refresh: load } = useCachedJson<TriageRow[]>(`/api/report/triage?view=${view}`, { topic: "tasks" });
  const rows = data ?? null;

  // Search, filters and sort run over the loaded list, like the other views.
  const [q, setQ] = React.useState("");
  const [severities, setSeverities] = React.useState<string[]>([]);
  const [areas, setAreas] = React.useState<string[]>([]);
  const [needsLook, setNeedsLook] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("newest");
  const shown = React.useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (severities.length && !severities.includes(r.severity)) return false;
      if (areas.length && !areas.includes(r.area)) return false;
      if (needsLook && r.staff?.taskKey) return false;
      if (!needle) return true;
      return [r.title, r.ref, r.description, r.staff?.reporterName || "", r.pageUrl]
        .some((v) => v.toLowerCase().includes(needle));
    });
    const time = (r: TriageRow) => new Date(r.createdAt).getTime();
    return list.sort((a, b) =>
      sort === "oldest"
        ? time(a) - time(b)
        : sort === "severity"
          ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || time(b) - time(a)
          : time(b) - time(a)
    );
  }, [rows, q, severities, areas, needsLook, sort]);
  const filtered = Boolean(q.trim() || severities.length || areas.length || needsLook);

  const accept = async (row: TriageRow) => {
    setBusy(true);
    const res = await fetch(`/api/report/${row.ref}/accept`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(json.error || "Could not accept");
    toast.success(`${row.ref} is now ${json.taskKey}`);
    await load();
    openTask(json.taskKey);
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    const body =
      action.kind === "duplicate"
        ? { action: "duplicate", of: text }
        : { action: action.kind, message: text || undefined };
    const res = await fetch(`/api/report/${action.row.ref}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(json.error || "Could not update");
    setAction(null);
    setText("");
    await load();
  };

  if (error && !rows) return <p className="text-sm text-muted-foreground">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["open", "all"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)}>
              {v === "open" ? "Open" : "All"}
            </Button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search reports"
            placeholder="Search reports"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            className="h-9 pl-8"
          />
        </div>
        <MultiSelect
          options={SEVERITIES.map((v) => ({ value: v, label: SEVERITY_LABEL[v] }))}
          value={severities}
          onChange={setSeverities}
          searchPlaceholder="Severity"
        >
          <Button variant="outline" size="sm" className={cn(severities.length && "border-primary")}>
            Severity{severities.length ? ` (${severities.length})` : ""}
          </Button>
        </MultiSelect>
        <MultiSelect
          options={AREAS.map((v) => ({ value: v, label: AREA_LABEL[v] }))}
          value={areas}
          onChange={setAreas}
          searchPlaceholder="Area"
        >
          <Button variant="outline" size="sm" className={cn(areas.length && "border-primary")}>
            Area{areas.length ? ` (${areas.length})` : ""}
          </Button>
        </MultiSelect>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={needsLook}
          className={cn(needsLook && "border-primary bg-primary/5")}
          onClick={() => setNeedsLook((v) => !v)}
        >
          Needs a look
        </Button>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger aria-label="Sort" className="h-9 w-auto gap-2">
            <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="severity">Most severe first</SelectItem>
          </SelectContent>
        </Select>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setSeverities([]);
              setAreas([]);
              setNeedsLook(false);
            }}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        {shown && rows && filtered ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {shown.length} of {rows.length}
          </span>
        ) : null}
      </div>
      {shown === null ? (
        <RowsSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {filtered ? "No reports match these filters." : view === "open" ? "No open reports." : "No reports."}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {shown.map((row) => {
            const open = expanded === row.ref;
            const linked = row.staff?.taskKey;
            return (
              <li key={row.ref} className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.ref)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                >
                  <span className="font-mono text-xs text-muted-foreground">{row.ref}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
                  <Badge variant={row.severity === "blocker" ? "destructive" : "muted"}>{row.severityLabel}</Badge>
                  <span className="text-xs text-muted-foreground">{row.areaLabel}</span>
                  {row.needsInfo ? <Badge variant="warning">Needs info</Badge> : null}
                  {linked ? (
                    <Badge variant="outline">{row.statusLabel}</Badge>
                  ) : (
                    <Badge variant="warning">Needs a look</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {row.staff?.reporterName}
                    {row.staff?.reporterStatus === "Alumni" ? " (alum)" : ""} ·{" "}
                    {DateTime.fromISO(row.createdAt).setZone(TASK_ZONE).toFormat("LLL d")}
                  </span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                    <div className="tt-md break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(row.description) }} />
                    <dl className="m-0 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto,1fr]">
                      {row.pageUrl ? (<><dt>Page</dt><dd className="m-0 break-all">{row.pageUrl}</dd></>) : null}
                      {row.userAgent ? (<><dt>Device</dt><dd className="m-0 break-all">{row.userAgent}</dd></>) : null}
                      {row.appVersion ? (<><dt>App</dt><dd className="m-0">{row.appVersion}</dd></>) : null}
                      {row.staff?.duplicateOf ? (<><dt>Duplicate of</dt><dd className="m-0">{row.staff.duplicateOf}</dd></>) : null}
                    </dl>
                    {row.screenshots.length ? (
                      <div className="flex flex-wrap gap-2">
                        {row.screenshots.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Screenshot from the report" className="size-full object-cover" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {linked ? (
                        <Button size="sm" onClick={() => openTask(linked)}>
                          Open {linked}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => accept(row)} disabled={busy}>
                          Accept
                        </Button>
                      )}
                      {!linked ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setAction({ kind: "duplicate", row })}>
                            Duplicate of...
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAction({ kind: "wont_fix", row })}>
                            Won&apos;t fix
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAction({ kind: "need_info", row })}>
                            Need info
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`/report/${row.ref}`} target="_blank" rel="noreferrer">
                          Thread
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(action)} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "duplicate" ? "Mark as duplicate" : action?.kind === "wont_fix" ? "Won't fix" : "Ask for more information"}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "duplicate"
                ? "The reporter will follow the original report from now on."
                : action?.kind === "wont_fix"
                  ? "The reporter sees this message, if you write one."
                  : "The reporter sees this message and is asked to reply."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="triage-text">{action?.kind === "duplicate" ? "Original report" : "Message to the reporter"}</Label>
            {action?.kind === "duplicate" ? (
              <Input id="triage-text" placeholder="TTDG-R1203" value={text} onChange={(e) => setText(e.target.value)} />
            ) : (
              <Textarea id="triage-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={runAction}
              disabled={busy || ((action?.kind === "duplicate" || action?.kind === "need_info") && !text.trim())}
              className={cn(action?.kind === "wont_fix" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {action?.kind === "duplicate" ? "Mark duplicate" : action?.kind === "wont_fix" ? "Close as won't fix" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
