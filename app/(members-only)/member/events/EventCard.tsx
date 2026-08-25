"use client";

import * as React from "react";
import {
  CalendarClock,
  CalendarSync,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Play,
  QrCode,
  Square,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GEM_CATEGORY_LABELS, GemCategory } from "@/lib/gem";

import {
  EVENT_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatEventWhen,
  isRecurring,
  resolveEventType,
  type EventItem,
} from "./types";

/** The badge a status gets. Colour is always paired with the word. */
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;

  if (status === "ongoing") {
    return (
      <Badge variant="success" className="gap-1">
        <Play className="size-3" aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="size-3" aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge variant="muted" className="gap-1">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CalendarClock className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

/**
 * One event, with whatever the reader is allowed to do to it.
 *
 * The actions are the whole reason this is a card rather than a row: starting
 * an event, running check-in and ending it are three taps a committee head
 * makes while standing in front of the room.
 */
export function EventCard({
  event,
  committeeLabel,
  color,
  canManage,
  onStart,
  onCancel,
  onEnd,
  onViewAttendance,
}: {
  event: EventItem;
  committeeLabel: string;
  /** The committee's colour for the current appearance. */
  color?: string;
  canManage: boolean;
  onStart: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onViewAttendance: () => void;
}) {
  const category =
    event.gemCategory && GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
      ? GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
      : "Uncategorized";

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{event.name}</CardTitle>
          <StatusBadge status={event.status} />
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {formatDate(event.startTime)} · {formatEventWhen(event)}
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{EVENT_TYPE_LABEL[resolveEventType(event)]}</Badge>
          <Badge variant="outline" className="gap-1.5">
            {color ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
            ) : (
              <Users className="size-3" aria-hidden="true" />
            )}
            {committeeLabel}
          </Badge>
          <Badge variant="outline">GEM: {category}</Badge>
          {isRecurring(event) ? (
            <Badge variant="outline" className="gap-1">
              <CalendarSync className="size-3" aria-hidden="true" />
              Recurring
            </Badge>
          ) : null}
          {/* An event hidden from alumni never reaches their calendar at all,
            * so this is the only place an active can tell whether it is theirs
            * to pass on. */}
          <Badge variant={event.visibleToAlumni ? "secondary" : "muted"}>
            {event.visibleToAlumni ? "Alumni welcome" : "Actives only"}
          </Badge>
        </div>

        {event.description ? (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        ) : null}

        {event.location ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {event.location}
          </p>
        ) : null}
      </CardContent>

      {canManage ? (
        <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
          {event.status === "scheduled" ? (
            <>
              <Button type="button" size="sm" onClick={onStart}>
                <Play className="size-4" />
                Start event
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onCancel}>
                <X className="size-4" />
                Cancel
              </Button>
            </>
          ) : null}

          {event.status === "ongoing" ? (
            <>
              <Button type="button" size="sm" asChild>
                <a href={`/member/events/${event._id}/check-in`}>
                  <QrCode className="size-4" />
                  Start check-in
                </a>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onEnd}>
                <Square className="size-4" />
                End event
              </Button>
            </>
          ) : null}

          {event.status === "completed" ? (
            <Button type="button" size="sm" variant="outline" onClick={onViewAttendance}>
              <ClipboardList className="size-4" />
              View attendance
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
