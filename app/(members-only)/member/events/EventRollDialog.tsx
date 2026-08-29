"use client";

import * as React from "react";
import { MapPin, Pencil, Undo2, UserPlus, Users } from "lucide-react";

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
 */

export interface RollMember {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
}

export function EventRollDialog({
  event,
  members,
  onClose,
  onRefresh,
  onEdit,
}: {
  /** The full event, as returned by `/api/events/:id`. */
  event: any | null;
  members: RollMember[];
  onClose: () => void;
  /** Re-reads the event after a check-in lands. */
  onRefresh: (eventId: string) => Promise<void>;
  /** Offered only where the caller can edit the event. */
  onEdit?: (eventId: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  // The row that can still be taken back. A confirm on every add costs
  // everyone a click to protect against the rare wrong one; undo sits on the
  // person's own row, next to the name it would remove.
  const [undoableId, setUndoableId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!event) {
      setQuery("");
      setUndoableId(null);
    }
  }, [event]);

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
                {onEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => onEdit(event._id)}
                  >
                    <Pencil className="size-4" />
                    Edit event
                  </Button>
                ) : null}
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
                          #{member.rollNo}
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
                              onClick={() => void undo(entry.memberId._id)}
                            >
                              <Undo2 className="size-4" aria-hidden="true" />
                              Undo
                            </Button>
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

/** Active members, which is who a roll can contain. */
export function useActiveMembers(): RollMember[] {
  const [members, setMembers] = React.useState<RollMember[]>([]);

  React.useEffect(() => {
    let active = true;
    fetch("/api/members")
      .then((response) => (response.ok ? response.json() : []))
      .then((data: RollMember[]) => {
        if (active) setMembers(data.filter((member) => member.status === "Active"));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return members;
}
