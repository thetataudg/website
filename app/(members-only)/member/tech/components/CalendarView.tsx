"use client";

// Due dates on a month grid, plus "Subscribe", which hands out the member's
// existing ICS feed (open tasks assigned to you are in it).
import * as React from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { BigCalendar, type BigCalendarEvent } from "@/components/ui/big-calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TASK_ZONE } from "@/lib/tasks/constants";
import { useTracker } from "./TrackerProvider";
import { Tip } from "./bits";

/// A Phoenix calendar day as a local Date at midnight, so the grid (which
/// works in browser-local days) puts the task on the day it is due in Phoenix.
function phoenixDayAsLocal(iso: string): Date {
  const dt = DateTime.fromISO(iso).setZone(TASK_ZONE);
  return new Date(dt.year, dt.month - 1, dt.day);
}

export function CalendarView() {
  const { tasks, applyFilters, openTask } = useTracker();
  const [month, setMonth] = React.useState(() => new Date());

  const events = React.useMemo<BigCalendarEvent[]>(
    () =>
      applyFilters(tasks)
        .filter((t) => t.dueAt && t.status !== "canceled")
        .map((t) => {
          const day = phoenixDayAsLocal(t.dueAt!);
          const tone =
            t.status === "done"
              ? "hsl(var(--muted-foreground))"
              : t.dueState === "overdue"
                ? "#b91c1c"
                : "hsl(var(--primary))";
          return {
            id: t.id,
            title: `${t.key} ${t.title}`,
            start: day,
            end: day,
            key: t.key,
            style: { backgroundColor: tone, color: "white" },
          };
        }),
    [tasks, applyFilters]
  );

  const subscribe = async () => {
    try {
      const res = await fetch("/api/calendar/subscription");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not get your calendar link");
      window.location.href = json.webcalUrl;
      await navigator.clipboard?.writeText(json.httpsUrl).catch(() => undefined);
      toast.success("Calendar link copied");
    } catch (err: any) {
      toast.error(err.message || "Could not get your calendar link");
    }
  };

  return (
    <Card className="overflow-hidden">
      <BigCalendar.Root date={month} onDateChange={setMonth} events={events} maxLanes={3} rowMinHeight="6.5rem">
        <BigCalendar.Header className="flex-wrap border-b px-4 py-3">
          {({ next, prev, today, currentDate }) => (
            <>
              <h2 className="m-0 text-lg font-semibold tracking-tight">
                {DateTime.fromJSDate(currentDate).toFormat("LLLL yyyy")}
              </h2>
              <div className="flex items-center gap-1">
                <Tip label="Previous month"><Button variant="ghost" size="icon" aria-label="Previous month" onClick={prev}>
                  <ChevronLeft aria-hidden="true" />
                </Button></Tip>
                <Button variant="outline" size="sm" onClick={today}>
                  Today
                </Button>
                <Tip label="Next month"><Button variant="ghost" size="icon" aria-label="Next month" onClick={next}>
                  <ChevronRight aria-hidden="true" />
                </Button></Tip>
                <Button variant="outline" size="sm" onClick={subscribe} className="ml-2">
                  <CalendarPlus aria-hidden="true" />
                  Subscribe
                </Button>
              </div>
            </>
          )}
        </BigCalendar.Header>
        <BigCalendar.Grid className="rounded-none border-0">
          {(event, position) => (
            <BigCalendar.Item
              title={event.title}
              style={event.style as React.CSSProperties}
              isStart={position.isStart}
              isEnd={position.isEnd}
              isMiddle={position.isMiddle}
              onClick={() => openTask(String(event.key))}
            />
          )}
        </BigCalendar.Grid>
      </BigCalendar.Root>
    </Card>
  );
}
