"use client";

import * as React from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { DatePicker } from "@/components/ui/date-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationInput } from "@/components/ui/location-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { GEM_CATEGORIES, GEM_CATEGORY_LABELS } from "@/lib/gem";
import { toArizonaInputValue, toArizonaIso } from "@/lib/recurrence";

import type {
  Committee,
  EventItem,
  EventLocationKind,
  VirtualPlatform,
} from "./types";
import { VIRTUAL_PLATFORM_LABEL, platformExpectsLink } from "./types";

/**
 * The one form that makes and edits an event.
 *
 * Shared by Manage events and Committee events, which were two copies of the
 * same twenty fields with slightly different bugs in each. What differs
 * between them is only what the form is *allowed* to change — a committee page
 * cannot make a chapter-wide event, and a committee head cannot move an event
 * to somebody else's committee — so those are props rather than two forms.
 */

const UNCATEGORIZED = "uncategorized";

export interface EventFormValues {
  name: string;
  description: string;
  committeeId: string;
  startTime: string;
  endTime: string;
  location: string;
  locationKind: EventLocationKind;
  virtualPlatform: string;
  virtualLink: string;
  gemCategory: string;
  eventType: string;
  status: string;
  visibleToAlumni: boolean;
  chapterWide: boolean;
  recurrenceEnabled: boolean;
  recurrenceFrequency: string;
  recurrenceInterval: string;
  recurrenceEndDate: string;
  recurrenceCount: string;
}

function blankForm(defaults?: Partial<EventFormValues>): EventFormValues {
  return {
    name: "",
    description: "",
    committeeId: "",
    startTime: "",
    endTime: "",
    location: "",
    locationKind: "physical",
    virtualPlatform: "",
    virtualLink: "",
    gemCategory: "",
    eventType: "event",
    status: "scheduled",
    visibleToAlumni: true,
    chapterWide: false,
    recurrenceEnabled: false,
    recurrenceFrequency: "weekly",
    recurrenceInterval: "1",
    recurrenceEndDate: "",
    recurrenceCount: "1",
    ...defaults,
  };
}

function toDateInputValue(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formFor(event: any, defaults?: Partial<EventFormValues>): EventFormValues {
  return {
    name: event.name || "",
    description: event.description || "",
    committeeId: event.committeeId || "",
    startTime: toArizonaInputValue(event.startTime),
    endTime: toArizonaInputValue(event.endTime),
    location: event.location || "",
    // Matches the schema default: every event that existed before the field
    // did was a physical one.
    locationKind: event.locationKind === "virtual" ? "virtual" : "physical",
    virtualPlatform: event.virtualPlatform || "",
    virtualLink: event.virtualLink || "",
    gemCategory: event.gemCategory || "",
    eventType: event.eventType || (event.committeeId ? "event" : "chapter"),
    status: event.status || "scheduled",
    visibleToAlumni: !!event.visibleToAlumni,
    chapterWide: event.eventType === "chapter" || !event.committeeId,
    recurrenceEnabled: !!(event.recurrence?.enabled || event.recurrenceEnabled),
    recurrenceFrequency:
      event.recurrence?.frequency || event.recurrenceFrequency || "weekly",
    recurrenceInterval: String(
      event.recurrence?.interval || event.recurrenceInterval || 1
    ),
    recurrenceEndDate: event.recurrence?.endDate
      ? toDateInputValue(event.recurrence.endDate)
      : event.recurrenceEndDate || "",
    recurrenceCount: String(event.recurrence?.count || 1),
    ...defaults,
  };
}

export function EventFormDialog({
  open,
  onOpenChange,
  event,
  committees,
  fixedCommitteeId,
  allowChapterWide = true,
  canChangeCommittee = true,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The event being edited, or null to create one. */
  event: any | null;
  committees: Committee[];
  /** Pins every event this form makes to one committee. */
  fixedCommitteeId?: string | null;
  allowChapterWide?: boolean;
  canChangeCommittee?: boolean;
  onSaved: (event: EventItem, appliedToSeries: boolean) => Promise<void> | void;
}) {
  const editing = !!event?._id;
  const [form, setForm] = React.useState<EventFormValues>(() => blankForm());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seriesPrompt, setSeriesPrompt] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSeriesPrompt(false);
    // A form opened from a committee already knows three of its own answers,
    // so it starts with them filled in rather than asking. Mirrors
    // `EventPrefill.committeeMeeting` in the iOS app; the two have to agree or
    // the same action produces different events depending on where it was
    // started. All of it stays editable: a committee might schedule a service
    // project rather than a meeting.
    const pinned = fixedCommitteeId
      ? committees.find((committee) => committee._id === fixedCommitteeId)
      : null;
    setForm(
      event
        ? formFor(event, fixedCommitteeId ? { committeeId: fixedCommitteeId } : undefined)
        : blankForm({
            committeeId: fixedCommitteeId ?? "",
            eventType: fixedCommitteeId ? "meeting" : "event",
            gemCategory: fixedCommitteeId ? "committee-meeting" : "",
            name: pinned ? `${pinned.name} meeting` : "",
          })
    );
  }, [open, event, fixedCommitteeId, committees]);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const isRecurringSeries = !!(
    event?.recurrence?.enabled || event?.recurrenceParentId
  );

  async function save(scope?: "single" | "series") {
    // Editing one of a series is two different acts, so it asks which.
    if (editing && !scope && isRecurringSeries) {
      setSeriesPrompt(true);
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      ...form,
      startTime: toArizonaIso(form.startTime),
      endTime: toArizonaIso(form.endTime),
      locationKind: form.locationKind,
      // Explicit nulls, so switching an event back to a room clears the
      // platform on the server rather than leaving the old one attached.
      virtualPlatform:
        form.locationKind === "virtual" ? form.virtualPlatform || null : null,
      virtualLink: form.locationKind === "virtual" ? form.virtualLink.trim() : "",
      committeeId: form.chapterWide ? null : form.committeeId || null,
      gemCategory: form.gemCategory || null,
      recurrence: {
        enabled: form.recurrenceEnabled,
        frequency: form.recurrenceFrequency,
        interval: Number(form.recurrenceInterval) || 1,
        endDate: form.recurrenceEndDate || null,
        count: Number(form.recurrenceCount) || 1,
      },
    };
    if (editing) payload.applyToSeries = scope === "series" ? "series" : "single";

    try {
      const response = await fetch(editing ? `/api/events/${event._id}` : "/api/events", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || (editing ? "The event could not be updated." : "The event could not be created.")
        );
      }

      await onSaved(await response.json(), scope === "series");
      setSeriesPrompt(false);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setSaving(false);
    }
  }

  const committeeLocked =
    !!fixedCommitteeId || form.chapterWide || (editing && !canChangeCommittee);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit event" : "Create event"}</DialogTitle>
            <DialogDescription>
              Times are chapter time. Everything here can be changed later.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(submit) => {
              submit.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-name">Event name</Label>
                <Input
                  id="event-name"
                  value={form.name}
                  onChange={(change) => set("name", change.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-type">Type</Label>
                <Select
                  value={form.eventType}
                  onValueChange={(value) => {
                    set("eventType", value);
                    if (value === "chapter") {
                      set("chapterWide", true);
                      set("committeeId", "");
                    } else if (form.chapterWide) {
                      set("chapterWide", false);
                    }
                  }}
                >
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    {allowChapterWide ? (
                      <SelectItem value="chapter">Chapter</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-committee">Committee</Label>
                <Select
                  value={form.committeeId || UNCATEGORIZED}
                  onValueChange={(value) =>
                    set("committeeId", value === UNCATEGORIZED ? "" : value)
                  }
                  disabled={committeeLocked}
                >
                  <SelectTrigger id="event-committee">
                    <SelectValue placeholder="Select committee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCATEGORIZED}>No committee</SelectItem>
                    {committees.map((committee) => (
                      <SelectItem key={committee._id} value={committee._id}>
                        {committee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-category">GEM category</Label>
                <Select
                  value={form.gemCategory || UNCATEGORIZED}
                  onValueChange={(value) =>
                    set("gemCategory", value === UNCATEGORIZED ? "" : value)
                  }
                >
                  <SelectTrigger id="event-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
                    {GEM_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {GEM_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-status">Status</Label>
                <Select value={form.status} onValueChange={(value) => set("status", value)}>
                  <SelectTrigger id="event-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-start">Start</Label>
                <DateTimePicker
                  id="event-start"
                  value={form.startTime}
                  onChange={(next) => {
                    set("startTime", next);
                    // An end before its start is never what anybody meant, so
                    // moving the start carries the end along by the same gap.
                    if (!form.endTime || form.endTime < next) {
                      const start = new Date(next);
                      if (!Number.isNaN(start.getTime())) {
                        start.setHours(start.getHours() + 1);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        set(
                          "endTime",
                          `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
                            start.getDate()
                          )}T${pad(start.getHours())}:${pad(start.getMinutes())}`
                        );
                      }
                    }
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-end">End</Label>
                <DateTimePicker
                  id="event-end"
                  value={form.endTime}
                  onChange={(next) => set("endTime", next)}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="event-location">
                    {form.locationKind === "virtual" ? "Room or channel" : "Location"}
                  </Label>
                  {/* Two buttons rather than a select: there are exactly two
                      answers, and which one is chosen changes the fields
                      underneath, which a dropdown hides until it is opened. */}
                  <div className="inline-flex rounded-md border p-0.5">
                    {(["physical", "virtual"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          set("locationKind", kind);
                          // A physical event carries no platform and no link,
                          // so switching back cannot leave a dead Zoom URL on
                          // an event that now happens in a room.
                          if (kind === "physical") {
                            set("virtualPlatform", "");
                            set("virtualLink", "");
                          }
                        }}
                        className={`rounded px-3 py-1 text-xs font-medium transition ${
                          form.locationKind === kind
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={form.locationKind === kind}
                      >
                        {kind === "physical" ? "In person" : "Virtual"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <LocationInput
                    id="event-location"
                    value={form.location}
                    onValueChange={(next) => set("location", next)}
                    placeholder={
                      form.locationKind === "virtual"
                        ? "Tech channel"
                        : "Discovery Hall 250"
                    }
                    className={form.location ? "pr-9" : undefined}
                  />
                  {/* Clearing by hand meant holding backspace through a full
                      postal address, which is the whole reason a wrong click
                      on a suggestion felt so expensive. */}
                  {form.location ? (
                    <button
                      type="button"
                      onClick={() => set("location", "")}
                      aria-label="Clear location"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                {form.locationKind === "virtual" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={form.virtualPlatform || UNCATEGORIZED}
                      onValueChange={(value) =>
                        set(
                          "virtualPlatform",
                          value === UNCATEGORIZED ? "" : value
                        )
                      }
                    >
                      <SelectTrigger aria-label="Platform">
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNCATEGORIZED}>Choose a platform</SelectItem>
                        {(
                          Object.keys(VIRTUAL_PLATFORM_LABEL) as VirtualPlatform[]
                        ).map((platform) => (
                          <SelectItem key={platform} value={platform}>
                            {VIRTUAL_PLATFORM_LABEL[platform]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Never required. An officer who has not made the Zoom yet
                        should still be able to put the event on the calendar. */}
                    {platformExpectsLink(
                      (form.virtualPlatform || null) as VirtualPlatform | null
                    ) ? (
                      <div className="relative">
                        <Input
                          id="event-virtual-link"
                          value={form.virtualLink}
                          onChange={(e) => set("virtualLink", e.target.value)}
                          placeholder="Link (optional)"
                          inputMode="url"
                          className={form.virtualLink ? "pr-9" : undefined}
                        />
                        {form.virtualLink ? (
                          <button
                            type="button"
                            onClick={() => set("virtualLink", "")}
                            aria-label="Clear link"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="event-description">Description</Label>
                <Textarea
                  id="event-description"
                  rows={3}
                  value={form.description}
                  onChange={(change) => set("description", change.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {allowChapterWide ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="event-chapter-wide"
                    checked={form.chapterWide}
                    onCheckedChange={(checked) => {
                      const on = checked === true;
                      set("chapterWide", on);
                      if (on) {
                        set("eventType", "chapter");
                        set("committeeId", "");
                      }
                    }}
                  />
                  <Label htmlFor="event-chapter-wide" className="font-normal">
                    Chapter-wide event (no committee)
                  </Label>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="event-alumni"
                  checked={form.visibleToAlumni}
                  onCheckedChange={(checked) => set("visibleToAlumni", checked === true)}
                />
                <Label htmlFor="event-alumni" className="font-normal">
                  Visible to alumni
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="event-repeat"
                  checked={form.recurrenceEnabled}
                  onCheckedChange={(checked) =>
                    set("recurrenceEnabled", checked === true)
                  }
                />
                <Label htmlFor="event-repeat" className="font-normal">
                  Repeat this event
                </Label>
              </div>
            </div>

            {form.recurrenceEnabled ? (
              <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-frequency">Frequency</Label>
                  <Select
                    value={form.recurrenceFrequency}
                    onValueChange={(value) => set("recurrenceFrequency", value)}
                  >
                    <SelectTrigger id="event-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-interval">Repeat every</Label>
                  <Input
                    id="event-interval"
                    type="number"
                    min={1}
                    value={form.recurrenceInterval}
                    onChange={(change) => set("recurrenceInterval", change.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-until">Ends on</Label>
                  <DatePicker
                    id="event-until"
                    value={form.recurrenceEndDate}
                    onChange={(next) => set("recurrenceEndDate", next)}
                    placeholder="No end date"
                    clearable
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-count">Generate next</Label>
                  <Input
                    id="event-count"
                    type="number"
                    min={1}
                    value={form.recurrenceCount}
                    onChange={(change) => set("recurrenceCount", change.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Creates this many occurrences now. More generate as events complete.
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>That didn&apos;t work</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={seriesPrompt} onOpenChange={setSeriesPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply these changes where?</AlertDialogTitle>
            <AlertDialogDescription>
              This event repeats. Change only this occurrence, or every future one in
              the series?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => void save("single")}>
              Just this event
            </Button>
            <AlertDialogAction
              onClick={(click) => {
                click.preventDefault();
                void save("series");
              }}
            >
              All future events
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
