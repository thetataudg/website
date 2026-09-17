"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "../../../components/LoadingState";
import type { FilterActions, FilterCriteria, MailFilter, MailLabel } from "./types";

const EMPTY_CRITERIA: FilterCriteria = {
  from: "",
  to: "",
  subject: "",
  hasWords: "",
  doesNotHave: "",
  hasAttachment: false,
};

const EMPTY_ACTIONS: FilterActions = {
  skipInbox: false,
  markRead: false,
  star: false,
  labelId: null,
  trash: false,
};

/// "Matches: from:(x) subject:(y)", Gmail's one-line summary of a filter.
function describeCriteria(c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.from) parts.push(`from:(${c.from})`);
  if (c.to) parts.push(`to:(${c.to})`);
  if (c.subject) parts.push(`subject:(${c.subject})`);
  if (c.hasWords) parts.push(c.hasWords);
  if (c.doesNotHave) parts.push(`-{${c.doesNotHave}}`);
  if (c.hasAttachment) parts.push("has:attachment");
  return parts.join(" ");
}

function describeActions(a: FilterActions, labels: MailLabel[]): string {
  const parts: string[] = [];
  if (a.trash) parts.push("Delete it");
  if (a.skipInbox) parts.push("Skip Inbox");
  if (a.markRead) parts.push("Mark as read");
  if (a.star) parts.push("Star it");
  if (a.labelId) parts.push(`Apply label "${labels.find((l) => l.id === a.labelId)?.name ?? "deleted label"}"`);
  return parts.join(", ");
}

export default function FiltersDialog({
  open,
  labels,
  prefill,
  onClose,
  onChanged,
}: {
  open: boolean;
  labels: MailLabel[];
  /// Opens straight to a new filter with these criteria filled in, from
  /// "Filter messages like these".
  prefill: Partial<FilterCriteria> | null;
  onClose: () => void;
  /// A filter was applied to existing mail, so the list may be stale.
  onChanged: () => void;
}) {
  const [filters, setFilters] = useState<MailFilter[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; criteria: FilterCriteria; actions: FilterActions } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/mail/filters");
    const body = await res.json().catch(() => ({}));
    if (res.ok) setFilters(body.filters);
    else toast.error("Couldn't load your filters.");
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    setEditing(prefill ? { id: null, criteria: { ...EMPTY_CRITERIA, ...prefill }, actions: EMPTY_ACTIONS } : null);
  }, [open, prefill, load]);

  async function remove(filter: MailFilter) {
    const res = await fetch(`/api/mail/filters/${filter.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete that filter.");
    setFilters((list) => (list ?? []).filter((f) => f.id !== filter.id));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        {editing ? (
          <FilterForm
            key={editing.id ?? "new"}
            initial={editing}
            labels={labels}
            onBack={() => setEditing(null)}
            onSaved={(applied) => {
              setEditing(null);
              void load();
              if (applied) {
                toast.success(`Filter applied to ${applied} ${applied === 1 ? "message" : "messages"}`);
                onChanged();
              } else {
                toast.success("Filter saved");
              }
            }}
          />
        ) : (
          <>
            <DialogHeader className="border-b px-6 py-4 text-left">
              <DialogTitle>Filters</DialogTitle>
              <DialogDescription>Rules that sort new mail as it arrives.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filters === null ? (
                <div className="flex justify-center py-10">
                  <LoadingSpinner size="sm" />
                </div>
              ) : filters.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">No filters yet.</p>
              ) : (
                <ul className="divide-y">
                  {filters.map((f) => (
                    <li key={f.id} className="flex items-start gap-3 px-6 py-3">
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="m-0 break-words text-sm font-medium text-foreground">
                          Matches: {describeCriteria(f.criteria)}
                        </p>
                        <p className="m-0 mt-0.5 text-sm text-muted-foreground">Do this: {describeActions(f.actions, labels)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit filter"
                        onClick={() => setEditing({ id: f.id, criteria: f.criteria, actions: f.actions })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete filter" onClick={() => remove(f)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter className="border-t px-6 py-3">
              <Button onClick={() => setEditing({ id: null, criteria: EMPTY_CRITERIA, actions: EMPTY_ACTIONS })}>
                <Plus className="size-4" /> Create a filter
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterForm({
  initial,
  labels,
  onBack,
  onSaved,
}: {
  initial: { id: string | null; criteria: FilterCriteria; actions: FilterActions };
  labels: MailLabel[];
  onBack: () => void;
  onSaved: (applied: number) => void;
}) {
  const [criteria, setCriteria] = useState(initial.criteria);
  const [actions, setActions] = useState(initial.actions);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const setC = <K extends keyof FilterCriteria>(key: K, value: FilterCriteria[K]) =>
    setCriteria((c) => ({ ...c, [key]: value }));
  const setA = <K extends keyof FilterActions>(key: K, value: FilterActions[K]) =>
    setActions((a) => ({ ...a, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(initial.id ? `/api/mail/filters/${initial.id}` : "/api/mail/filters", {
        method: initial.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria, actions, applyToExisting }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save that filter.");
      onSaved(body.applied ?? 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const text = (key: "from" | "to" | "subject" | "hasWords" | "doesNotHave", label: string, placeholder?: string) => (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
      <Label htmlFor={`filter-${key}`} className="text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`filter-${key}`}
        value={criteria[key]}
        placeholder={placeholder}
        maxLength={300}
        onChange={(e) => setC(key, e.target.value)}
      />
    </div>
  );

  const check = (id: string, checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b px-4 py-3 text-left">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to filters">
          <ArrowLeft className="size-4" />
        </Button>
        <DialogTitle>{initial.id ? "Edit filter" : "Create a filter"}</DialogTitle>
        <DialogDescription className="sr-only">Choose what to match and what to do with it.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-3">
          {text("from", "From", "name@example.com")}
          {text("to", "To")}
          {text("subject", "Subject")}
          {text("hasWords", "Has the words")}
          {text("doesNotHave", "Doesn't have")}
          <div className="pl-[8.25rem]">
            {check("filter-attachment", criteria.hasAttachment, (v) => setC("hasAttachment", v), "Has attachment")}
          </div>
        </section>

        <section className="space-y-3 border-t pt-5">
          <p className="m-0 text-sm font-medium">When a message matches</p>
          {check("filter-skip", actions.skipInbox, (v) => setA("skipInbox", v), "Skip the Inbox (Archive it)")}
          {check("filter-read", actions.markRead, (v) => setA("markRead", v), "Mark as read")}
          {check("filter-star", actions.star, (v) => setA("star", v), "Star it")}
          <div className="flex items-center gap-2.5 text-sm">
            <Checkbox
              id="filter-label"
              checked={Boolean(actions.labelId)}
              disabled={!labels.length}
              onCheckedChange={(v) => setA("labelId", v === true ? labels[0]?.id ?? null : null)}
            />
            <label htmlFor="filter-label" className="cursor-pointer">
              Apply the label
            </label>
            <Select
              value={actions.labelId ?? ""}
              onValueChange={(v) => setA("labelId", v || null)}
              disabled={!labels.length}
            >
              <SelectTrigger className="h-8 w-44" aria-label="Label">
                <SelectValue placeholder={labels.length ? "Choose label" : "No labels yet"} />
              </SelectTrigger>
              <SelectContent>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {check("filter-trash", actions.trash, (v) => setA("trash", v), "Delete it")}
        </section>

        <section className="border-t pt-5">
          {check(
            "filter-existing",
            applyToExisting,
            setApplyToExisting,
            "Also apply filter to matching conversations"
          )}
        </section>
      </div>

      <DialogFooter className="gap-2 border-t px-6 py-3">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoadingSpinner size="sm" />}
          {initial.id ? "Save filter" : "Create filter"}
        </Button>
      </DialogFooter>
    </form>
  );
}
