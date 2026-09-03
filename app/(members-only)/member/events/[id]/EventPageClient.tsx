"use client";

import * as React from "react";
import Link from "next/link";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "../EventCard";
import {
  EVENT_TYPE_LABEL,
  resolveEventType,
  virtualHref,
  VIRTUAL_PLATFORM_LABEL,
  type EventItem,
} from "../types";

const RSVP_CHOICES = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Can't make it" },
] as const;

const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Phoenix",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Phoenix",
});

export default function EventPageClient({ eventId }: { eventId: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [event, setEvent] = React.useState<EventItem | null>(null);
  const [mine, setMine] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
        if (!response.ok) {
          // A 403 here is an alumnus opening an event that was never theirs to
          // see, which is a different sentence from "this does not exist".
          setError(
            response.status === 403
              ? "This event isn't open to you."
              : "We couldn't find that event."
          );
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        setEvent(data);
        setError(null);

        // Separate call, and allowed to fail quietly: not knowing the viewer's
        // own answer is a reason to show the buttons unselected, not a reason
        // to fail the page.
        try {
          const rsvp = await fetch(`/api/events/${eventId}/rsvp`, { cache: "no-store" });
          if (rsvp.ok && !cancelled) {
            const summary = await rsvp.json();
            setMine(summary?.mine ?? null);
          }
        } catch {
          /* leave it unselected */
        }
      } catch {
        if (!cancelled) setError("We couldn't load that event.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, isSignedIn]);

  const respond = async (status: string) => {
    if (saving) return;
    setSaving(true);
    // Optimistic, and reverted on failure. The buttons are the whole point of
    // the page, and a half-second of dead UI on a tap reads as a broken link.
    const previous = mine;
    const next = mine === status ? null : status;
    setMine(next);
    try {
      const response = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) setMine(previous);
    } catch {
      setMine(previous);
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Clerk returns to the current URL after sign-in, which is what makes a
  // shared link survive a login: the recipient signs in and lands on the event
  // they were sent, not on the dashboard.
  if (!isSignedIn) return <RedirectToSignIn />;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Event not found."}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/member/events">Back to the calendar</Link>
        </Button>
      </div>
    );
  }

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const isVirtual = event.locationKind === "virtual";
  const href = virtualHref(event);
  const isPast = end.getTime() < Date.now();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/member/events"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Calendar
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={event.status} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {EVENT_TYPE_LABEL[resolveEventType(event)]}
        </span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{event.name}</h1>

      <div className="mt-6 space-y-3 rounded-lg border p-4">
        <Row icon={<CalendarDays className="h-4 w-4" />} label="When">
          {dateFormat.format(start)}
        </Row>
        <Row icon={<Clock className="h-4 w-4" />} label="Time">
          {timeFormat.format(start)} to {timeFormat.format(end)}
        </Row>

        {isVirtual ? (
          <Row icon={<Video className="h-4 w-4" />} label={platformLabel(event)}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                {event.location?.trim() || "Join"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              // No link is a normal state, not a failure: a Discord meeting in
              // the chapter's own server never has one.
              event.location?.trim() || "Online"
            )}
          </Row>
        ) : event.location ? (
          <Row icon={<MapPin className="h-4 w-4" />} label="Where">
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-primary hover:underline"
            >
              {event.location}
            </a>
          </Row>
        ) : null}
      </div>

      {event.description ? (
        <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </p>
      ) : null}

      {!isPast && event.status !== "cancelled" ? (
        <div className="mt-8">
          <p className="text-sm font-medium">Are you coming?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {RSVP_CHOICES.map((choice) => (
              <Button
                key={choice.value}
                type="button"
                variant={mine === choice.value ? "default" : "outline"}
                size="sm"
                disabled={saving}
                onClick={() => respond(choice.value)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function platformLabel(event: EventItem): string {
  const platform = event.virtualPlatform;
  return platform ? VIRTUAL_PLATFORM_LABEL[platform] : "Online";
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
