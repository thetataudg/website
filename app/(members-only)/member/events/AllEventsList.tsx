"use client";

import * as React from "react";
import Link from "next/link";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { ArrowLeft, CircleAlert, Search, TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { swatchHex } from "@/lib/calendarColors";

import LoadingState from "../../components/LoadingState";
import { useTheme } from "../../components/ThemeProvider";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";

import { AttendanceDialog } from "./EventDialogs";
import { EventCard } from "./EventCard";
import { useEventsData } from "./useEventsData";
import { STATUS_LABEL, isRecurring, type EventItem } from "./types";

/**
 * One scope of events, in full.
 *
 * The overview page shows three of these and sends people here for the rest,
 * so this is the screen that has to cope with a semester's worth: it searches,
 * it filters by status, and it says how much it is showing.
 */
export function AllEventsList({ scope }: { scope: "mine" | "others" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const {
    loading,
    error,
    committeeLabel,
    swatchFor,
    canManage,
    updateStatus,
    fetchDetails,
    sortedFor,
  } = useEventsData();

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [includePast, setIncludePast] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [summary, setSummary] = React.useState<any>(null);
  const [pendingCancel, setPendingCancel] = React.useState<EventItem | null>(null);

  const all = sortedFor(scope, includePast);

  const events = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((event) => {
      if (status !== "all" && event.status !== status) return false;
      if (!needle) return true;
      return [event.name, event.description, event.location, committeeLabel(event)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [all, query, status, committeeLabel]);

  async function cancel(event: EventItem, applyToSeries: "single" | "series") {
    await updateStatus(event._id, "cancelled", applyToSeries);
    setPendingCancel(null);
  }

  if (!isLoaded) return <LoadingState message="Loading events..." />;

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>You must be signed in to see chapter events.</AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (loading) return <LoadingState message="Loading events..." />;

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        eyebrow={
          <Link
            href="/member/events"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to events
          </Link>
        }
        title={scope === "mine" ? "My events" : "All other events"}
        description={
          scope === "mine"
            ? "Your committee events plus chapter-wide updates."
            : "Everything else happening around the chapter."
        }
        actions={
          <Badge variant="muted">
            {events.length === all.length
              ? `${all.length} ${all.length === 1 ? "event" : "events"}`
              : `${events.length} of ${all.length}`}
          </Badge>
        }
      />

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert className="size-4" />
          <AlertTitle>Events could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] lg:w-[40rem]">
        <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
            className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["scheduled", "ongoing", "completed", "cancelled"].map((option) => (
              <SelectItem key={option} value={option}>
                {STATUS_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Checkbox
          id="include-past-all"
          checked={includePast}
          onCheckedChange={(checked) => setIncludePast(checked === true)}
        />
        <Label htmlFor="include-past-all" className="text-sm font-normal">
          Show past events
        </Label>
      </div>

      {events.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={`${event._id}-${event.startTime}`}
              event={event}
              committeeLabel={committeeLabel(event)}
              color={swatchHex(swatchFor(event), isDark)}
              canManage={canManage(event)}
              onStart={() => void updateStatus(event._id, "ongoing")}
              onEnd={async () => {
                const details = await updateStatus(event._id, "completed");
                if (details) setSummary(details);
              }}
              onCancel={() =>
                isRecurring(event)
                  ? setPendingCancel(event)
                  : void updateStatus(event._id, "cancelled")
              }
              onViewAttendance={async () => {
                const details = await fetchDetails(event._id);
                if (details) setSummary(details);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">No events found</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {query || status !== "all"
                ? "Try a different search or status filter."
                : includePast
                ? "Nothing here yet."
                : "Nothing upcoming. Turn on past events to see what has already happened."}
            </p>
            {query || status !== "all" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      <AttendanceDialog event={summary} onClose={() => setSummary(null)} />

      <Dialog open={!!pendingCancel} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel a recurring event</DialogTitle>
            <DialogDescription>
              Cancel just this occurrence, or every future one in the series?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => pendingCancel && void cancel(pendingCancel, "single")}
            >
              Just this event
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => pendingCancel && void cancel(pendingCancel, "series")}
            >
              All future events
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
