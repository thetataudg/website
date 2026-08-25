"use client";

import * as React from "react";
import Link from "next/link";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  LayoutList,
  Loader2,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  BigCalendar,
  addDays,
  endOfDay,
  startOfDay,
  type BigCalendarEvent,
  type BigCalendarView,
  type DateRange,
} from "@/components/ui/big-calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { swatchHex, swatchStyle } from "@/lib/calendarColors";
import { cn } from "@/lib/utils";

import LoadingState from "../../components/LoadingState";
import { useTheme } from "../../components/ThemeProvider";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";

import { AttendanceDialog } from "./EventDialogs";
import { EventCard, StatusBadge } from "./EventCard";
import { useEventsData } from "./useEventsData";
import {
  EVENT_TYPE_LABEL,
  buildIcs,
  expandOccurrences,
  formatDate,
  formatEventWhen,
  formatMonth,
  formatTime,
  formatWeekRange,
  isRecurring,
  resolveEventType,
  type EventItem,
} from "./types";

/** How many of each list the overview shows before handing off to its own page. */
const PREVIEW_COUNT = 3;

/**
 * Everything the chapter has planned.
 *
 * The month leads, because "what is happening and when" is the question
 * almost everybody arrives with; the lists underneath are a shortlist of what
 * is next, and the full ones live on their own pages where they have room to
 * be searched.
 */
export default function EventsWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const {
    events,
    loading,
    error,
    reload,
    canForceSync,
    committeeLabel,
    swatchFor,
    canManage,
    updateStatus,
    fetchDetails,
    sortedFor,
  } = useEventsData();

  // The palette flips with the appearance rather than being tinted by CSS: the
  // dark shades are different hues, not the light ones faded.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [view, setView] = React.useState<"calendar" | "list">("calendar");
  const [includePast, setIncludePast] = React.useState(false);
  const [month, setMonth] = React.useState(() => new Date());
  const [calendarView, setCalendarView] = React.useState<BigCalendarView>("month");
  const [selection, setSelection] = React.useState<DateRange>({ start: null, end: null });
  const [dayOpen, setDayOpen] = React.useState<Date | null>(null);
  const [summary, setSummary] = React.useState<any>(null);
  const [pendingCancel, setPendingCancel] = React.useState<EventItem | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  async function forceSync() {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const response = await fetch("/api/calendar/force-sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Calendar sync failed.");
      setSyncFeedback(`Synced ${payload.synced ?? 0} of ${payload.total ?? 0} events`);
      await reload();
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Calendar sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  function download(items: EventItem[], name: string) {
    const blob = new Blob([buildIcs(items)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const mine = sortedFor("mine", includePast);
  const others = sortedFor("others", includePast);

  /** The span on show, plus a day or a week either side of it. */
  const [rangeStart, rangeEnd] = React.useMemo(() => {
    if (calendarView === "day") {
      return [addDays(startOfDay(month), -1), addDays(endOfDay(month), 1)];
    }
    if (calendarView === "week") {
      const first = addDays(startOfDay(month), -month.getDay());
      return [addDays(first, -1), addDays(endOfDay(first), 8)];
    }
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return [addDays(startOfDay(first), -7), addDays(endOfDay(last), 7)];
  }, [month, calendarView]);

  const monthOccurrences = React.useMemo(
    () => expandOccurrences(events, rangeStart, rangeEnd),
    [events, rangeStart, rangeEnd]
  );

  /** What the span is called, in the words that span uses. */
  const rangeLabel = React.useMemo(() => {
    if (calendarView === "day") return formatDate(month);
    if (calendarView === "week") {
      const first = addDays(startOfDay(month), -month.getDay());
      return formatWeekRange(first, addDays(first, 6));
    }
    return formatMonth(month);
  }, [month, calendarView]);

  const calendarEvents = React.useMemo<BigCalendarEvent[]>(
    () =>
      monthOccurrences.map((event) => ({
        id: `${event._id}-${event.startTime}`,
        title: event.name,
        start: new Date(event.startTime),
        end: new Date(event.endTime),
        status: event.status,
        style: swatchStyle(swatchFor(event), isDark),
      })),
    [monthOccurrences, swatchFor, isDark]
  );

  const eventsOn = React.useCallback(
    (day: Date) =>
      monthOccurrences.filter(
        (event) =>
          new Date(event.startTime) <= endOfDay(day) &&
          new Date(event.endTime) >= startOfDay(day)
      ),
    [monthOccurrences]
  );

  const selectedEvents = React.useMemo(() => {
    if (!selection.start || !selection.end) return [];
    const from = startOfDay(selection.start);
    const to = endOfDay(selection.end);
    return monthOccurrences.filter(
      (event) => new Date(event.startTime) <= to && new Date(event.endTime) >= from
    );
  }, [selection, monthOccurrences]);

  const eventColor = React.useCallback(
    (event: EventItem) => swatchHex(swatchFor(event), isDark),
    [swatchFor, isDark]
  );

  const cardHandlers = (event: EventItem) => ({
    onStart: () => void updateStatus(event._id, "ongoing"),
    onEnd: async () => {
      const details = await updateStatus(event._id, "completed");
      if (details) setSummary(details);
    },
    onCancel: () =>
      isRecurring(event)
        ? setPendingCancel(event)
        : void updateStatus(event._id, "cancelled"),
    onViewAttendance: async () => {
      const details = await fetchDetails(event._id);
      if (details) setSummary(details);
    },
  });

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
        title="Events"
        description="Meetings, chapter events, and committee plans."
        actions={
          <>
            {canForceSync ? (
              <Button type="button" variant="outline" disabled={syncing} onClick={forceSync}>
                {syncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {syncing ? "Syncing…" : "Force calendar sync"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                download(
                  view === "calendar" ? monthOccurrences : [...mine, ...others],
                  `events-${formatMonth(month).replace(/\s+/g, "-").toLowerCase()}.ics`
                )
              }
            >
              <Download className="size-4" />
              Download .ics
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert className="size-4" />
          <AlertTitle>Events could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {syncFeedback ? (
        <Alert className="mb-6">
          <RefreshCw className="size-4" />
          <AlertDescription>{syncFeedback}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={view} onValueChange={(value) => setView(value as "calendar" | "list")}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="size-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <LayoutList className="size-4" />
              List
            </TabsTrigger>
          </TabsList>

          {view === "list" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-past"
                checked={includePast}
                onCheckedChange={(checked) => setIncludePast(checked === true)}
              />
              <Label htmlFor="include-past" className="text-sm font-normal">
                Show past events
              </Label>
            </div>
          ) : null}
        </div>

        <TabsContent value="calendar" className="mt-0 space-y-4">
          {/* No fixed height and nothing to scroll inside it: a month is six
            * rows at most, and a calendar you have to scroll to see the end of
            * is not showing you the month. */}
          <Card className="overflow-hidden">
            <BigCalendar.Root
              date={month}
              onDateChange={setMonth}
              view={calendarView}
              selected={selection}
              onSelectedChange={setSelection}
              events={calendarEvents}
              weekStartsOn={0}
              maxLanes={4}
              rowMinHeight="8.5rem"
              onDayClick={(day) => {
                // In a week, a day heading is a way *into* that day rather
                // than a summary of it — the blocks beside it already are one.
                if (calendarView === "week") {
                  setMonth(day);
                  setCalendarView("day");
                  return;
                }
                setDayOpen(day);
              }}
            >
              <BigCalendar.Header className="border-b px-4 py-3 sm:px-6">
                {({ next, prev, today, currentDate }) => (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <CalendarDays
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <h2 className="m-0 truncate text-lg font-semibold tracking-tight">
                        {rangeLabel}
                      </h2>
                      <Badge variant="muted" className="ml-1 shrink-0">
                        {monthOccurrences.length}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex rounded-md border p-0.5">
                        {(["month", "week", "day"] as BigCalendarView[]).map((option) => (
                          <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant={calendarView === option ? "secondary" : "ghost"}
                            className="h-7 px-2.5 capitalize"
                            aria-pressed={calendarView === option}
                            onClick={() => setCalendarView(option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={prev}
                          aria-label={`Previous ${calendarView}`}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" onClick={today}>
                          Today
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={next}
                          aria-label={`Next ${calendarView}`}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </BigCalendar.Header>

              {calendarView === "month" ? (
                <BigCalendar.Grid className="rounded-none border-0 border-t">
                  {(event, position) => (
                    <BigCalendar.Item
                      title={event.title}
                      style={event.style as React.CSSProperties}
                      isStart={position.isStart}
                      isEnd={position.isEnd}
                      isMiddle={position.isMiddle}
                      onClick={() => setDayOpen(event.start)}
                      // Status is said by the treatment, not by a second colour:
                      // the hue is the committee's and has to stay that way.
                      className={cn(
                        event.status === "cancelled" && "line-through opacity-60",
                        event.status === "completed" && "opacity-70"
                      )}
                    />
                  )}
                </BigCalendar.Grid>
              ) : (
                <BigCalendar.TimeGrid
                  className="rounded-none border-0 border-t"
                  allDayChildren={(event, position) => (
                    <BigCalendar.Item
                      title={event.title}
                      style={event.style as React.CSSProperties}
                      isStart={position.isStart}
                      isEnd={position.isEnd}
                      isMiddle={position.isMiddle}
                      onClick={() => setDayOpen(event.start)}
                      className={cn(
                        event.status === "cancelled" && "line-through opacity-60",
                        event.status === "completed" && "opacity-70"
                      )}
                    />
                  )}
                >
                  {(event) => (
                    <BigCalendar.Block
                      title={event.title}
                      subtitle={`${formatTime(event.start)} – ${formatTime(event.end)}`}
                      style={event.style as React.CSSProperties}
                      onClick={() => setDayOpen(event.start)}
                      className={cn(
                        event.status === "cancelled" && "line-through opacity-60",
                        event.status === "completed" && "opacity-70"
                      )}
                    />
                  )}
                </BigCalendar.TimeGrid>
              )}
            </BigCalendar.Root>
          </Card>

          {selection.start && selection.end ? (
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    {formatDate(selection.start)}
                    {startOfDay(selection.start).getTime() !==
                    startOfDay(selection.end).getTime()
                      ? ` – ${formatDate(selection.end)}`
                      : ""}
                  </CardTitle>
                  <CardDescription>
                    {selectedEvents.length === 1
                      ? "1 event in this range"
                      : `${selectedEvents.length} events in this range`}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelection({ start: null, end: null })}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    disabled={!selectedEvents.length}
                    onClick={() => download(selectedEvents, "selected-events.ics")}
                  >
                    <CalendarPlus className="size-4" />
                    Export selection
                  </Button>
                </div>
              </CardHeader>
              {selectedEvents.length ? (
                <CardContent className="space-y-2 border-t pt-4">
                  {selectedEvents.slice(0, 8).map((event) => (
                    <div
                      key={`${event._id}-${event.startTime}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 font-medium">{event.name}</span>
                      <span className="text-muted-foreground">
                        {formatDate(event.startTime)} · {formatEventWhen(event)}
                      </span>
                    </div>
                  ))}
                  {selectedEvents.length > 8 ? (
                    <p className="text-xs text-muted-foreground">
                      +{selectedEvents.length - 8} more in the export.
                    </p>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              {calendarView === "month"
                ? "Drag across dates to select a range, or shift-click to extend one. Click a day to see everything on it."
                : calendarView === "week"
                ? "Click a day heading to open it on its own. Click an event to see the details."
                : "Click an event to see the details."}
            </p>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-0 space-y-8">
          <EventSection
            title="My events"
            description="Your committee events plus chapter-wide updates."
            empty="No events assigned to your committees yet."
            href="/member/events/my/all"
            events={mine}
            committeeLabel={committeeLabel}
            color={eventColor}
            canManage={canManage}
            handlers={cardHandlers}
          />

          <EventSection
            title="Other events"
            description="Everything else happening around the chapter."
            empty="No other events right now."
            href="/member/events/all"
            events={others}
            committeeLabel={committeeLabel}
            color={eventColor}
            canManage={canManage}
            handlers={cardHandlers}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!dayOpen} onOpenChange={(open) => !open && setDayOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dayOpen ? formatDate(dayOpen) : ""}</DialogTitle>
            <DialogDescription>
              {dayOpen && eventsOn(dayOpen).length === 1
                ? "1 event"
                : `${dayOpen ? eventsOn(dayOpen).length : 0} events`}
            </DialogDescription>
          </DialogHeader>

          {dayOpen && eventsOn(dayOpen).length ? (
            <div className="space-y-3">
              {eventsOn(dayOpen).map((event) => (
                <div key={`${event._id}-${event.startTime}`} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{event.name}</p>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatEventWhen(event)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">
                      {EVENT_TYPE_LABEL[resolveEventType(event)]}
                    </Badge>
                    <Badge variant="outline" className="gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: eventColor(event) }}
                      />
                      {committeeLabel(event)}
                    </Badge>
                    <Badge variant={event.visibleToAlumni ? "secondary" : "muted"}>
                      {event.visibleToAlumni ? "Alumni welcome" : "Actives only"}
                    </Badge>
                  </div>
                  {event.location ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {event.location}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing on this day.
            </p>
          )}
        </DialogContent>
      </Dialog>

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
              onClick={() => {
                if (pendingCancel) void updateStatus(pendingCancel._id, "cancelled", "single");
                setPendingCancel(null);
              }}
            >
              Just this event
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingCancel) void updateStatus(pendingCancel._id, "cancelled", "series");
                setPendingCancel(null);
              }}
            >
              All future events
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

/**
 * The next few of one kind of event, and a way to the rest.
 *
 * Three is the shortlist: enough to answer "what's next" at a glance, few
 * enough that the two sections and the calendar still fit on one screen.
 */
function EventSection({
  title,
  description,
  empty,
  href,
  events,
  committeeLabel,
  color,
  canManage,
  handlers,
}: {
  title: string;
  description: string;
  empty: string;
  href: string;
  events: EventItem[];
  committeeLabel: (event: EventItem) => string;
  color: (event: EventItem) => string;
  canManage: (event: EventItem) => boolean;
  handlers: (event: EventItem) => {
    onStart: () => void;
    onEnd: () => void;
    onCancel: () => void;
    onViewAttendance: () => void;
  };
}) {
  const preview = events.slice(0, PREVIEW_COUNT);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">
            {events.length === 1 ? "1 event" : `${events.length} events`}
          </Badge>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={href} className="no-underline">
              View all
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {preview.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {preview.map((event) => (
              <EventCard
                key={`${event._id}-${event.startTime}`}
                event={event}
                committeeLabel={committeeLabel(event)}
                color={color(event)}
                canManage={canManage(event)}
                {...handlers(event)}
              />
            ))}
          </div>
          {events.length > preview.length ? (
            <p className="text-sm text-muted-foreground">
              Showing the next {preview.length} of {events.length}.{" "}
              <Link href={href} className="font-medium text-foreground underline">
                View all
              </Link>
              .
            </p>
          ) : null}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {empty}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
