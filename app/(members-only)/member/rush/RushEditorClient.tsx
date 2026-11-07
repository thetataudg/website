"use client";

// The rush chair's editor. Everything here publishes on save; the last 20
// saves are kept for "Version history" in place of a draft workflow.
import * as React from "react";
import Image from "next/image";
import { DateTime } from "luxon";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  History,
  ImageUp,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { prepareImageForUpload } from "@/lib/prepareImageUpload";
import { isValidInterestUrl, posterSrcFor, RUSH_ZONE } from "@/lib/rush/format";
import type { RushEventData, RushPageData } from "@/lib/rush/types";

type Revision = { index: number; savedAt: string; savedByName: string };
type EditorState = {
  data: RushPageData;
  isDefault: boolean;
  updatedAt: string | null;
  updatedByName: string;
  revisions: Revision[];
};

/// Event rows carry a client key so React can track them through reorders.
type Row = RushEventData & { rowKey: string };

const newKey = () => Math.random().toString(36).slice(2, 10);

/// The picker speaks wall-clock `YYYY-MM-DDTHH:mm`; we store instants. Both
/// conversions happen in Phoenix so the browser's own zone never matters.
const toLocal = (iso: string) =>
  iso ? DateTime.fromISO(iso).setZone(RUSH_ZONE).toFormat("yyyy-MM-dd'T'HH:mm") : "";
const fromLocal = (local: string) =>
  local ? DateTime.fromISO(local, { zone: RUSH_ZONE }).toUTC().toISO() || "" : "";

const formatSaved = (iso: string) =>
  DateTime.fromISO(iso).setZone(RUSH_ZONE).toFormat("LLL d, h:mm a");

function toRows(data: RushPageData): Row[] {
  return data.events.map((e) => ({ ...e, rowKey: e._id || newKey() }));
}

export default function RushEditorClient({ initial }: { initial: EditorState }) {
  const [state, setState] = React.useState(initial);
  const [form, setForm] = React.useState<RushPageData>(initial.data);
  const [rows, setRows] = React.useState<Row[]>(() => toRows(initial.data));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const set = <K extends keyof RushPageData>(key: K, value: RushPageData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const setPoster = (patch: Partial<RushPageData["poster"]>) =>
    set("poster", { ...form.poster, ...patch });
  const editRows = (next: (rows: Row[]) => Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const updateRow = (rowKey: string, patch: Partial<Row>) =>
    editRows((rs) => rs.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    editRows((rs) => {
      const next = [...rs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const applyState = (next: EditorState) => {
    setState(next);
    setForm(next.data);
    setRows(toRows(next.data));
    setDirty(false);
  };

  const urlOk = isValidInterestUrl(form.interestFormUrl);

  async function save() {
    if (!urlOk) {
      toast.error("The interest form link must start with https://");
      return;
    }
    setSaving(true);
    try {
      const body: RushPageData = {
        ...form,
        events: rows.map(({ rowKey: _rowKey, ...e }) => e),
      };
      const res = await fetch("/api/rush", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save");
      applyState(json);
      toast.success("Published to /rush");
    } catch (err: any) {
      toast.error(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function restore(index: number) {
    setSaving(true);
    try {
      const res = await fetch("/api/rush/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionIndex: index }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not restore");
      applyState(json);
      setShowHistory(false);
      toast.success("Restored and published");
    } catch (err: any) {
      toast.error(err.message || "Could not restore");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPoster(file: File) {
    setUploading(true);
    try {
      const prepared = await prepareImageForUpload(file);
      const body = new FormData();
      body.append("file", prepared);
      const res = await fetch("/api/rush/poster", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setPoster({ key: json.key, width: json.width, height: json.height, hidden: false });
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const field = (
    id: keyof RushPageData,
    label: string,
    opts: { multiline?: boolean; rows?: number; placeholder?: string } = {}
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`rush-${id}`}>{label}</Label>
      {opts.multiline ? (
        <Textarea
          id={`rush-${id}`}
          rows={opts.rows ?? 4}
          value={String(form[id] ?? "")}
          placeholder={opts.placeholder}
          onChange={(e) => set(id, e.target.value as never)}
        />
      ) : (
        <Input
          id={`rush-${id}`}
          value={String(form[id] ?? "")}
          placeholder={opts.placeholder}
          onChange={(e) => set(id, e.target.value as never)}
        />
      )}
    </div>
  );

  return (
    <PageContainer className="max-w-6xl space-y-6 pb-28">
      <PageHeader
        title="Rush page"
        description={
          state.updatedAt
            ? `Last published ${formatSaved(state.updatedAt)}${
                state.updatedByName ? ` by ${state.updatedByName}` : ""
              }.`
            : "Showing the built-in page. Saving publishes your first version."
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="rush-open" className="text-base">
                  Rush is open
                </Label>
                <p className="text-sm text-muted-foreground">
                  {form.isOpen ? "Upcoming events are listed." : "The closed message is shown."}
                </p>
              </div>
              <Switch
                id="rush-open"
                checked={form.isOpen}
                onCheckedChange={(checked) => set("isOpen", checked)}
              />
            </div>
            {field("closedMessage", "Closed message")}
            {field("closedIntro", "Hero text while closed (optional)", {
              multiline: true,
              rows: 3,
              placeholder: "Spring 2027 rush starts in January. Fill out the interest form to hear first.",
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hero</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {field("eyebrow", "Eyebrow", { placeholder: "Fall 2026 Recruitment" })}
            {field("title", "Title")}
            {field("intro", "Intro", { multiline: true, rows: 4 })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Interest form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rush-interestFormUrl">Link</Label>
              <div className="flex gap-2">
                <Input
                  id="rush-interestFormUrl"
                  type="url"
                  value={form.interestFormUrl}
                  aria-invalid={!urlOk}
                  onChange={(e) => set("interestFormUrl", e.target.value)}
                />
                <Button variant="outline" asChild disabled={!urlOk}>
                  <a href={urlOk ? form.interestFormUrl : undefined} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" />
                    Test link
                  </a>
                </Button>
              </div>
              {!urlOk ? (
                <p className="text-sm text-destructive">Use a full https:// link.</p>
              ) : null}
            </div>
            {field("interestFormLabel", "Button label")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Poster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="relative h-40 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {form.poster.hidden ? (
                  <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                    Hidden
                  </span>
                ) : (
                  <Image
                    src={posterSrcFor(form.poster.key)}
                    alt={form.poster.alt || "Rush flyer"}
                    fill
                    sizes="128px"
                    className="object-contain"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPoster(file);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  loading={uploading}
                >
                  <ImageUp aria-hidden="true" />
                  {uploading ? "Uploading..." : "Replace"}
                </Button>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rush-poster-hidden">Hide poster</Label>
                  <Switch
                    id="rush-poster-hidden"
                    checked={form.poster.hidden}
                    onCheckedChange={(checked) => setPoster({ hidden: checked })}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rush-poster-alt">Alt text</Label>
              <Input
                id="rush-poster-alt"
                value={form.poster.alt}
                onChange={(e) => setPoster({ alt: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Events</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              editRows((rs) => [
                ...rs,
                {
                  rowKey: newKey(),
                  title: "",
                  startsAt: rs.length ? rs[rs.length - 1].startsAt : "",
                  location: rs.length ? rs[rs.length - 1].location : "",
                  featuring: "",
                  hidden: false,
                },
              ])
            }
          >
            <Plus aria-hidden="true" />
            Add event
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {field("eventsHeading", "Card heading", { placeholder: "Remaining Fall 2026 Events" })}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events. The timeline is hidden and the card shows the closed message.
            </p>
          ) : null}
          <ul className="list-none space-y-3 p-0">
            {rows.map((row, index) => (
              <li
                key={row.rowKey}
                className={`rounded-md border border-border p-3 ${row.hidden ? "opacity-60" : ""}`}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`ev-when-${row.rowKey}`}>Date and time</Label>
                    <DateTimePicker
                      id={`ev-when-${row.rowKey}`}
                      value={toLocal(row.startsAt)}
                      onChange={(value) => updateRow(row.rowKey, { startsAt: fromLocal(value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`ev-title-${row.rowKey}`}>Title</Label>
                    <Input
                      id={`ev-title-${row.rowKey}`}
                      value={row.title}
                      onChange={(e) => updateRow(row.rowKey, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`ev-loc-${row.rowKey}`}>Location</Label>
                    <Input
                      id={`ev-loc-${row.rowKey}`}
                      value={row.location}
                      onChange={(e) => updateRow(row.rowKey, { location: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="min-w-[12rem] flex-1 space-y-1.5">
                    <Label htmlFor={`ev-feat-${row.rowKey}`}>Featuring (optional)</Label>
                    <Input
                      id={`ev-feat-${row.rowKey}`}
                      value={row.featuring || ""}
                      placeholder="Featuring Board Game Club"
                      onChange={(e) => updateRow(row.rowKey, { featuring: e.target.value })}
                    />
                  </div>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(row.hidden)}
                      onCheckedChange={(checked) => updateRow(row.rowKey, { hidden: checked === true })}
                    />
                    Hidden
                  </label>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(index, 1)} disabled={index === rows.length - 1}>
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Duplicate"
                      onClick={() =>
                        editRows((rs) => {
                          const next = [...rs];
                          next.splice(index + 1, 0, { ...row, _id: undefined, rowKey: newKey() });
                          return next;
                        })
                      }
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove"
                      onClick={() => editRows((rs) => rs.filter((r) => r.rowKey !== row.rowKey))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Page copy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {field("whyText", "Why rush", { multiline: true, rows: 9 })}
          <div className="space-y-4">
            {field("startTitle", "New member card title")}
            {field("startText", "New member card text", { multiline: true, rows: 5 })}
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {dirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowHistory(true)}
              disabled={!state.revisions.length}
            >
              <History aria-hidden="true" />
              Version history
            </Button>
            <Button variant="outline" asChild>
              <a href="/rush" target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                View live page
              </a>
            </Button>
            <Button onClick={save} disabled={saving || !dirty} loading={saving}>
              {saving ? "Saving..." : "Save and publish"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>Restoring a version publishes it right away.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] list-none divide-y divide-border overflow-y-auto p-0">
            {state.revisions.map((revision) => (
              <li key={revision.index} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{formatSaved(revision.savedAt)}</p>
                  {revision.savedByName ? (
                    <p className="text-xs text-muted-foreground">{revision.savedByName}</p>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => restore(revision.index)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
