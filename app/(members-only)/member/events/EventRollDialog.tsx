"use client";

import * as React from "react";
import { MapPin, Pencil, RotateCcw, Undo2, UserPlus, Users, X } from "lucide-react";

import { describeCheckInSource } from "@/lib/checkinSource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GEM_CATEGORY_LABELS, GemCategory } from "@/lib/gem";

import { StatusBadge } from "./EventCard";
import {
  EVENT_TYPE_LABEL,
  formatDateTime,
  formatEventWhen,
  resolveEventType,
  type Committee,
  type EventItem,
} from "./types";

/**
 * One event, and who was at it.
 *
 * The same dialog on Manage events and Committee events: taking the roll is
 * the same job whichever list you reached the event from, and having it in one
 * place is what stopped the two pages disagreeing about who may add somebody.
 *
 * Adding an attendee here is a manual check-in — the API re-checks that the
 * caller is an admin, on E-Council, or head of the committee that owns the
 * event, so this offers it and the server decides it.
 *
 * Taking a roll should not start with typing. Before the search box, the
 * dialog lists the people most likely to be missing: everyone who said they
 * were going and everyone on the committee, minus whoever is already in. One
 * click adds a person, and one more checks in every RSVP at once. Search is
 * still there for the walk-ins, and it reaches alumni, as the phone's does.
 */

export interface RollMember {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
}

/** How many suggestions show before the rest are behind "Show all". */
const SUGGESTION_PREVIEW = 6;

/** How often an ongoing event's roll re-reads itself, in milliseconds. */
const LIVE_REFRESH_MS = 10_000;

interface Suggestion extends RollMember {
  reason: "rsvp" | "committee";
}

export function EventRollDialog({
  event,
  members,
  committee,
  onClose,
  onRefresh,
  onEdit,
  onReopen,
}: {
  /** The full event, as returned by `/api/events/:id`. */
  event: any | null;
  /** Everyone a roll can contain: active members and alumni. */
  members: RollMember[];
  /** The committee that owns the event, whose roster is suggested. */
  committee?: Committee | null;
  onClose: () => void;
  /** Re-reads the event after a check-in lands. */
  onRefresh: (eventId: string) => Promise<void>;
  /** Offered only where the caller can edit the event. */
  onEdit?: (eventId: string) => void;
  /** Puts a completed event back to ongoing so the door can run again. */
  onReopen?: (eventId: string) => Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [rsvps, setRsvps] = React.useState<RollMember[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  // The row that can still be taken back. A confirm on every add costs
  // everyone a click to protect against the rare wrong one; undo sits on the
  // person's own row, next to the name it would remove.
  const [undoableId, setUndoableId] = React.useState<string | null>(null);
  const [busy, setBusyState] = React.useState(false);
  const busyRef = React.useRef(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
  };

  const eventId: string | null = event?._id ?? null;
  const eventStatus: string | undefined = event?.status;

  React.useEffect(() => {
    if (!eventId) {
      setQuery("");
      setUndoableId(null);
      setRsvps([]);
      setShowAllSuggestions(false);
      setNotice(null);
    }
  }, [eventId]);

  // Who said they were going. Read once per event: it is the list of people to
  // expect, and it does not change because somebody was checked in.
  React.useEffect(() => {
    if (!eventId) return;
    let active = true;
    fetch(`/api/events/${eventId}/rsvp`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((summary) => {
        if (!active || !summary) return;
        setRsvps(
          (summary.responses ?? [])
            .filter((entry: any) => entry.status === "going")
            .map((entry: any) => ({
              _id: entry.memberId,
              fName: entry.fName,
              lName: entry.lName,
              rollNo: entry.rollNo,
            }))
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [eventId]);

  // While the door is open other officers and the scanner are adding people
  // too, so the count has to keep up without anyone refreshing the page.
  React.useEffect(() => {
    if (!eventId || eventStatus !== "ongoing") return;
    const timer = setInterval(() => {
      if (!busyRef.current && document.visibilityState === "visible") {
        void onRefresh(eventId);
      }
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [eventId, eventStatus, onRefresh]);

  const checkedInIds = React.useMemo(
    () =>
      new Set<string>(
        (event?.attendees ?? [])
          .map((entry: any) => entry.memberId?._id)
          .filter(Boolean)
      ),
    [event]
  );

  const suggestions = React.useMemo<Suggestion[]>(() => {
    const seen = new Set<string>();
    const list: Suggestion[] = [];
    const push = (member: RollMember, reason: Suggestion["reason"]) => {
      if (!member?._id || checkedInIds.has(member._id) || seen.has(member._id)) return;
      seen.add(member._id);
      list.push({ ...member, reason });
    };

    rsvps.forEach((member) => push(member, "rsvp"));

    const roster = [
      ...(committee?.committeeHeadId && typeof committee.committeeHeadId !== "string"
        ? [committee.committeeHeadId]
        : []),
      ...(committee?.committeeMembers ?? []).filter((m) => typeof m !== "string"),
    ] as any[];
    roster.forEach((member) => push(member as RollMember, "committee"));

    return list;
  }, [rsvps, committee, checkedInIds]);

  const pendingRsvps = suggestions.filter((entry) => entry.reason === "rsvp");
  const visibleSuggestions = showAllSuggestions
    ? suggestions
    : suggestions.slice(0, SUGGESTION_PREVIEW);

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    // Somebody already on the roll is not a suggestion, they are a duplicate.
    const already = new Set(
      (event?.attendees ?? []).map((entry: any) => entry.memberId?._id)
    );
    return members
      .filter((member) => !already.has(member._id))
      .filter((member) =>
        `${member.fName} ${member.lName} ${member.rollNo}`.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [query, members, event]);

  async function checkIn(member: RollMember) {
    if (!event?._id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/events/${event._id}/manual-check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member._id }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setUndoableId(data?.status === "already-checked-in" ? null : member._id);
        await onRefresh(event._id);
        setQuery("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkInAllRsvps() {
    if (!event?._id || !pendingRsvps.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${event._id}/manual-check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: pendingRsvps.map((member) => member._id) }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setUndoableId(null);
        setNotice(
          data?.added === 1 ? "Checked in 1 member." : `Checked in ${data?.added ?? 0} members.`
        );
        await onRefresh(event._id);
      } else {
        setNotice("That didn't work. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!event?._id || !onReopen) return;
    setBusy(true);
    try {
      await onReopen(event._id);
    } finally {
      setBusy(false);
    }
  }

  /// Which attendee is one click away from being removed. A single press
  /// arms the row rather than deleting it: this list is the attendance record
  /// an officer marks GEM against, and a mis-tap on a phone should not quietly
  /// take somebody off it.
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

  async function undo(memberId: string) {
    if (!event?._id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/events/${event._id}/manual-check-in`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (response.ok) {
        setUndoableId(null);
        setConfirmingId(null);
        await onRefresh(event._id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{event?.name}</DialogTitle>
            <DialogDescription>
              {event ? formatEventWhen(event as EventItem) : null}
            </DialogDescription>
          </DialogHeader>

          {event ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={event.status || "scheduled"} />
                <Badge variant="outline">
                  {EVENT_TYPE_LABEL[resolveEventType(event as EventItem)]}
                </Badge>
                <Badge variant="outline">
                  {event.gemCategory && GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
                    ? GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
                    : "Uncategorized"}
                </Badge>
                <div className="ml-auto flex flex-wrap gap-2">
                  {onReopen && event.status === "completed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void reopen()}
                    >
                      <RotateCcw className="size-4" />
                      Reopen check-in
                    </Button>
                  ) : null}
                  {onEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(event._id)}
                    >
                      <Pencil className="size-4" />
                      Edit event
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {event.description || "No description added yet."}
              </p>

              {event.location ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {event.location}
                </p>
              ) : null}

              <Separator />

              {suggestions.length ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Not checked in yet</p>
                    {pendingRsvps.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void checkInAllRsvps()}
                      >
                        Check in all RSVP&apos;d ({pendingRsvps.length})
                      </Button>
                    ) : null}
                  </div>
                  <div className="divide-y overflow-hidden rounded-md border">
                    {visibleSuggestions.map((member) => (
                      <button
                        key={member._id}
                        type="button"
                        disabled={busy}
                        onClick={() => void checkIn(member)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 truncate">
                          {member.fName} {member.lName}
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            #{member.rollNo}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {member.reason === "rsvp" ? "RSVP'd" : "Committee"}
                          </span>
                          <UserPlus className="size-4 text-muted-foreground" aria-hidden="true" />
                        </span>
                      </button>
                    ))}
                  </div>
                  {suggestions.length > SUGGESTION_PREVIEW ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllSuggestions((current) => !current)}
                    >
                      {showAllSuggestions
                        ? "Show fewer"
                        : `Show all ${suggestions.length}`}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {notice ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="roll-attendee">Add an attendee</Label>
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <UserPlus
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="roll-attendee"
                    value={query}
                    onChange={(change) => setQuery(change.target.value)}
                    placeholder="Type a name or roll number"
                    className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {matches.length ? (
                  <div className="divide-y overflow-hidden rounded-md border">
                    {matches.map((member) => (
                      <button
                        key={member._id}
                        type="button"
                        disabled={busy}
                        onClick={() => void checkIn(member)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 truncate">
                          {member.fName} {member.lName}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {member.status === "Alumni" ? "Alumni " : ""}#{member.rollNo}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : query.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    Nobody left to add under that name.
                  </p>
                ) : null}

              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    Attendees ({event.attendees?.length || 0})
                  </p>
                </div>

                {event.attendees?.length ? (
                  <div className="divide-y overflow-hidden rounded-md border">
                    {event.attendees.map((entry: any) => (
                      <div
                        key={entry.memberId?._id || entry.checkedInAt}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {entry.memberId?.fName} {entry.memberId?.lName}
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            #{entry.memberId?.rollNo}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-right text-xs text-muted-foreground">
                            {entry.checkedInAt ? formatDateTime(entry.checkedInAt) : ""}
                            {describeCheckInSource(entry) ? (
                              <span className="block">{describeCheckInSource(entry)}</span>
                            ) : null}
                          </span>
                          {entry.memberId?._id && entry.memberId._id === undoableId ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => undo(entry.memberId._id)}
                            >
                              <Undo2 className="size-4" aria-hidden="true" />
                              Undo
                            </Button>
                          ) : entry.memberId?._id ? (
                            confirmingId === entry.memberId._id ? (
                              <span className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => undo(entry.memberId._id)}
                                >
                                  Remove
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => setConfirmingId(null)}
                                >
                                  Cancel
                                </Button>
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                                disabled={busy}
                                aria-label={`Remove ${entry.memberId?.fName ?? ""} ${
                                  entry.memberId?.lName ?? ""
                                } from attendance`}
                                onClick={() => setConfirmingId(entry.memberId._id)}
                              >
                                <X className="size-4" aria-hidden="true" />
                              </Button>
                            )
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">
                    No check-ins recorded.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

    </>
  );
}

/**
 * Who a roll can contain: active members and alumni. An alumnus drops by for a
 * meeting or a service event often enough that the phone lets an officer add
 * one, so the website does too. Fetched only once `enabled`, because the
 * member list is large and most visits to a page never open a roll.
 */
export function useRollMembers(enabled = true): RollMember[] {
  const [members, setMembers] = React.useState<RollMember[]>([]);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/members")
      .then((response) => (response.ok ? response.json() : []))
      .then((data: RollMember[]) => {
        if (active) {
          setMembers(
            data.filter((member) => member.status === "Active" || member.status === "Alumni")
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);

  return members;
}
