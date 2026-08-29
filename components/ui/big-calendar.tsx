"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A full-month calendar with drag-to-select and continuous multi-day bars.
 *
 * A React port of the shadcn "big calendar", which ships for Svelte only. The
 * shape of the API is kept — a `Root` holding state, a `Header` and a `Grid`
 * that take render props where the Svelte original takes snippets — so the
 * upstream docs still describe this.
 *
 * The bars are laid out with CSS grid rather than absolute positioning: an
 * event spanning Tuesday to Friday is one grid item spanning four columns,
 * which is what makes it a single continuous bar with no arithmetic and no
 * drift when the cell width changes.
 */

export interface BigCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  /** Free-form, passed back to the item renderer. */
  type?: string;
  // eslint-disable-next-line
  [key: string]: unknown;
}

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** Where a bar sits relative to the whole event, for its rounded ends. */
export interface SegmentPosition {
  isStart: boolean;
  isEnd: boolean;
  isMiddle: boolean;
}

export type BigCalendarView = "month" | "week" | "day";

interface BigCalendarContextValue {
  date: Date;
  view: BigCalendarView;
  setDate: (date: Date) => void;
  selected: DateRange;
  events: BigCalendarEvent[];
  weekStartsOn: number;
  showWeekends: boolean;
  isDateDisabled?: (date: Date) => boolean;
  maxLanes: number;
  rowMinHeight: string;
  beginSelection: (date: Date, extend: boolean) => void;
  extendSelection: (date: Date) => void;
  endSelection: () => void;
  /** True when the pointer went down and up on the same day. */
  consumeClick: () => boolean;
  onDayClick?: (date: Date) => void;
}

const BigCalendarContext = React.createContext<BigCalendarContextValue | null>(null);

function useBigCalendar(): BigCalendarContextValue {
  const context = React.useContext(BigCalendarContext);
  if (!context) {
    throw new Error("BigCalendar parts must be used inside <BigCalendar.Root>.");
  }
  return context;
}

// MARK: - Dates

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const copy = startOfDay(date);
  const shift = (copy.getDay() - weekStartsOn + 7) % 7;
  return addDays(copy, -shift);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** The weeks a month grid needs, each already trimmed to the visible days. */
function buildWeeks(
  date: Date,
  weekStartsOn: number,
  showWeekends: boolean
): Date[][] {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const first = startOfWeek(monthStart, weekStartsOn);
  const weeks: Date[][] = [];

  let cursor = first;
  // Six rows at most, which is every arrangement a month can take.
  while (cursor <= monthEnd || weeks.length < 1) {
    const week: Date[] = [];
    for (let index = 0; index < 7; index += 1) {
      const day = addDays(cursor, index);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      if (showWeekends || !isWeekend) week.push(day);
    }
    weeks.push(week);
    cursor = addDays(cursor, 7);
    if (weeks.length >= 6) break;
  }

  return weeks;
}

/** One event's run inside one week, in column terms. */
interface Segment {
  event: BigCalendarEvent;
  column: number;
  span: number;
  lane: number;
  position: SegmentPosition;
}

/**
 * Places a week's events into lanes.
 *
 * Longest first, then earliest, so a five-day conference takes the top lane
 * and the one-day meetings arrange themselves underneath it rather than
 * pushing it down the cell.
 */
function layoutWeek(week: Date[], events: BigCalendarEvent[]): Segment[] {
  if (!week.length) return [];
  const weekStart = startOfDay(week[0]);
  const weekEnd = endOfDay(week[week.length - 1]);

  const overlapping = events
    .filter((event) => event.start <= weekEnd && event.end >= weekStart)
    .map((event) => {
      const firstIndex = week.findIndex((day) => day >= startOfDay(event.start));
      const column = Math.max(0, firstIndex === -1 ? 0 : firstIndex);
      let lastIndex = column;
      for (let index = column; index < week.length; index += 1) {
        if (startOfDay(week[index]) <= endOfDay(event.end)) lastIndex = index;
      }
      return {
        event,
        column,
        span: lastIndex - column + 1,
        position: {
          isStart: isSameDay(week[column], event.start) || event.start < weekStart,
          isEnd: isSameDay(week[lastIndex], event.end) || event.end > weekEnd,
          isMiddle: false,
        },
      };
    })
    .sort((a, b) => b.span - a.span || a.event.start.getTime() - b.event.start.getTime());

  const lanes: boolean[][] = [];
  const placed: Segment[] = [];

  for (const candidate of overlapping) {
    let lane = 0;
    for (;;) {
      if (!lanes[lane]) lanes[lane] = new Array(week.length).fill(false);
      const free = lanes[lane]
        .slice(candidate.column, candidate.column + candidate.span)
        .every((taken) => !taken);
      if (free) {
        for (let index = candidate.column; index < candidate.column + candidate.span; index += 1) {
          lanes[lane][index] = true;
        }
        break;
      }
      lane += 1;
    }

    placed.push({
      ...candidate,
      lane,
      position: {
        ...candidate.position,
        // A bar with neither end in this week is a pure continuation.
        isMiddle: !candidate.position.isStart && !candidate.position.isEnd,
      },
    });
  }

  return placed;
}

function withinRange(date: Date, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  const day = startOfDay(date).getTime();
  const from = startOfDay(range.start).getTime();
  const to = startOfDay(range.end).getTime();
  return day >= Math.min(from, to) && day <= Math.max(from, to);
}

// MARK: - Root

export interface BigCalendarRootProps {
  /** The date the view is anchored to: any day in the month, week, or the day itself. */
  date: Date;
  onDateChange: (date: Date) => void;
  /** What span to draw. Month is the grid; week and day are time grids. */
  view?: BigCalendarView;
  selected?: DateRange;
  onSelectedChange?: (range: DateRange) => void;
  events?: BigCalendarEvent[];
  /** 0 = Sunday. */
  weekStartsOn?: number;
  showWeekends?: boolean;
  /** Days that cannot be selected — they still show their events. */
  isDateDisabled?: (date: Date) => boolean;
  /** Bars per cell before the rest collapse into "+N more". */
  maxLanes?: number;
  /** Least height of one week row. Any CSS length. */
  rowMinHeight?: string;
  onDayClick?: (date: Date) => void;
  className?: string;
  children: React.ReactNode;
}

function Root({
  date,
  onDateChange,
  view = "month",
  selected,
  onSelectedChange,
  events = [],
  weekStartsOn = 0,
  showWeekends = true,
  isDateDisabled,
  maxLanes = 3,
  rowMinHeight = "7rem",
  onDayClick,
  className,
  children,
}: BigCalendarRootProps) {
  const anchor = React.useRef<Date | null>(null);
  const dragging = React.useRef(false);
  /** Whether the pointer crossed into another day before it came back up. */
  const moved = React.useRef(false);
  const range = React.useMemo(
    () => selected ?? { start: null, end: null },
    [selected]
  );

  const beginSelection = React.useCallback(
    (day: Date, extend: boolean) => {
      if (isDateDisabled?.(day)) return;
      // Shift-click extends from wherever the selection already starts, which
      // is the one gesture people try without being told about it.
      if (extend && range.start) {
        onSelectedChange?.({ start: range.start, end: day });
        anchor.current = range.start;
        return;
      }
      anchor.current = day;
      dragging.current = true;
      moved.current = false;
      onSelectedChange?.({ start: day, end: day });
    },
    [isDateDisabled, onSelectedChange, range.start]
  );

  const extendSelection = React.useCallback(
    (day: Date) => {
      if (!dragging.current || !anchor.current) return;
      if (isDateDisabled?.(day)) return;
      const from = anchor.current;
      if (!isSameDay(from, day)) moved.current = true;
      onSelectedChange?.(from <= day ? { start: from, end: day } : { start: day, end: from });
    },
    [isDateDisabled, onSelectedChange]
  );

  const endSelection = React.useCallback(() => {
    dragging.current = false;
  }, []);

  // A drag that happens to end on a day is not a click on it: releasing after
  // sweeping Monday to Friday should leave a range, not open Friday.
  const consumeClick = React.useCallback(() => {
    const wasClick = !moved.current;
    moved.current = false;
    return wasClick;
  }, []);

  // A drag that ends outside the grid still has to stop, or the next hover
  // over a cell would keep extending a selection nobody is holding.
  React.useEffect(() => {
    const stop = () => endSelection();
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [endSelection]);

  const value = React.useMemo<BigCalendarContextValue>(
    () => ({
      date,
      view,
      setDate: onDateChange,
      selected: range,
      events,
      weekStartsOn,
      showWeekends,
      isDateDisabled,
      maxLanes,
      rowMinHeight,
      beginSelection,
      extendSelection,
      endSelection,
      consumeClick,
      onDayClick,
    }),
    [
      date,
      view,
      onDateChange,
      range,
      events,
      weekStartsOn,
      showWeekends,
      isDateDisabled,
      maxLanes,
      rowMinHeight,
      beginSelection,
      extendSelection,
      endSelection,
      consumeClick,
      onDayClick,
    ]
  );

  return (
    <BigCalendarContext.Provider value={value}>
      <div className={cn("flex min-h-0 flex-col", className)}>{children}</div>
    </BigCalendarContext.Provider>
  );
}

// MARK: - Header

export interface BigCalendarHeaderRenderProps {
  next: () => void;
  prev: () => void;
  today: () => void;
  currentDate: Date;
}

function Header({
  className,
  children,
}: {
  className?: string;
  children: (props: BigCalendarHeaderRenderProps) => React.ReactNode;
}) {
  const { date, view, setDate } = useBigCalendar();

  // A month steps by months, a week by seven days, a day by one. Anything else
  // and the arrows would mean something different from what is on screen.
  const shift = (direction: number) => {
    if (view === "month") {
      setDate(new Date(date.getFullYear(), date.getMonth() + direction, 1));
      return;
    }
    setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  };

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {children({
        next: () => shift(1),
        prev: () => shift(-1),
        today: () => setDate(new Date()),
        currentDate: date,
      })}
    </div>
  );
}

// MARK: - Grid

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Grid({
  className,
  children,
  moreLabel = (count: number) => `+${count} more`,
}: {
  className?: string;
  /** Renders one event bar. The position flags drive its rounded ends. */
  children: (event: BigCalendarEvent, position: SegmentPosition) => React.ReactNode;
  moreLabel?: (count: number) => string;
}) {
  const {
    date,
    selected,
    events,
    weekStartsOn,
    showWeekends,
    isDateDisabled,
    maxLanes,
    rowMinHeight,
    beginSelection,
    extendSelection,
    endSelection,
    consumeClick,
    onDayClick,
  } = useBigCalendar();

  const weeks = React.useMemo(
    () => buildWeeks(date, weekStartsOn, showWeekends),
    [date, weekStartsOn, showWeekends]
  );

  const columns = weeks[0]?.length ?? 7;
  const headings = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => WEEKDAY_LABELS[(weekStartsOn + index) % 7]).filter(
        (label) => showWeekends || (label !== "Sat" && label !== "Sun")
      ),
    [weekStartsOn, showWeekends]
  );

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border", className)}>
      <div
        className="grid border-b bg-muted/50"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {headings.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        {weeks.map((week, weekIndex) => {
          const segments = layoutWeek(week, events);
          const visible = segments.filter((segment) => segment.lane < maxLanes);
          const laneCount = Math.min(
            maxLanes,
            segments.reduce((most, segment) => Math.max(most, segment.lane + 1), 0)
          );
          const hiddenPerDay = week.map(
            (_, dayIndex) =>
              segments.filter(
                (segment) =>
                  segment.lane >= maxLanes &&
                  dayIndex >= segment.column &&
                  dayIndex < segment.column + segment.span
              ).length
          );
          const hasMore = hiddenPerDay.some((count) => count > 0);
          const moreRow = hasMore ? laneCount + 2 : null;
          /**
           * Row 1 holds the day numbers, then one row per lane, then the
           * "+N more" line when there is one — and last a `1fr` filler that
           * takes whatever height `minHeight` adds beyond the content.
           *
           * That filler is the whole point of declaring the rows explicitly.
           * With implicit rows the tracks packed to the top, so the cells (and
           * with them their borders and hover) stopped where the last bar
           * ended and left the bottom of a quiet week undrawn.
           */
          const templateRows = [
            // The date badge is 1.5rem tall and sits below 0.375rem of cell
            // padding. Reserve a little extra space so today's circular badge
            // never touches the first event bar.
            "2.25rem",
            ...Array.from({ length: laneCount }, () => "1.5rem"),
            ...(hasMore ? ["1.25rem"] : []),
            "1fr",
          ].join(" ");

          return (
            <div
              key={weekIndex}
              className={cn(
                // Sized by its own rows, never squeezed by the flex parent: a
                // week with four bars in it is taller than one with none, and
                // `flex-1` would have clipped the difference.
                "relative grid shrink-0",
                weekIndex > 0 && "border-t"
              )}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: templateRows,
                minHeight: rowMinHeight,
              }}
            >
              {/* The cells: backgrounds, borders and the day number. Laid out
                * first so the bars draw over them. */}
              {week.map((day, dayIndex) => {
                const outside = day.getMonth() !== date.getMonth();
                const disabled = isDateDisabled?.(day) ?? false;
                const inRange = withinRange(day, selected);
                const today = isSameDay(day, new Date());

                return (
                  <div
                    key={dayKey(day)}
                    role="gridcell"
                    aria-selected={inRange}
                    aria-disabled={disabled || undefined}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      beginSelection(day, event.shiftKey);
                    }}
                    onPointerEnter={() => extendSelection(day)}
                    onPointerUp={() => {
                      endSelection();
                      if (consumeClick()) onDayClick?.(day);
                    }}
                    className={cn(
                      "flex select-none flex-col px-1.5 pb-1 pt-1.5 transition-colors",
                      dayIndex > 0 && "border-l",
                      outside && "bg-muted/30 text-muted-foreground",
                      disabled
                        ? "cursor-not-allowed bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,hsl(var(--muted))_6px,hsl(var(--muted))_12px)] opacity-60"
                        : "cursor-pointer hover:bg-accent/50",
                      inRange &&
                        "bg-primary/15 ring-1 ring-inset ring-primary/50 hover:bg-primary/20"
                    )}
                    style={{ gridRow: "1 / -1", gridColumn: dayIndex + 1 }}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center self-start rounded-full text-xs font-semibold tabular-nums",
                        today && "bg-primary text-primary-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}

              {visible.map((segment) => (
                <div
                  key={`${segment.event.id}-${segment.column}`}
                  className="pointer-events-auto z-10 min-w-0 px-1 pb-0.5"
                  style={{
                    gridRow: segment.lane + 2,
                    gridColumn: `${segment.column + 1} / span ${segment.span}`,
                  }}
                >
                  {children(segment.event, segment.position)}
                </div>
              ))}

              {/* One "+N more" per day, under the bars it stands in for. */}
              {week.map((day, dayIndex) => {
                const hidden = hiddenPerDay[dayIndex];
                if (!hidden) return null;
                return (
                  <button
                    key={`more-${dayKey(day)}`}
                    type="button"
                    onClick={() => onDayClick?.(day)}
                    className="z-10 px-1.5 text-left text-[0.7rem] font-medium leading-5 text-muted-foreground hover:text-foreground"
                    style={{ gridRow: moreRow ?? laneCount + 2, gridColumn: dayIndex + 1 }}
                  >
                    {moreLabel(hidden)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// MARK: - Item

const ITEM_VARIANTS: Record<string, string> = {
  default: "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/30",
  chapter: "bg-primary text-primary-foreground",
  meeting: "bg-blue-600/15 text-foreground ring-1 ring-inset ring-blue-600/40",
  event: "bg-emerald-700/15 text-foreground ring-1 ring-inset ring-emerald-700/40",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  destructive: "bg-destructive/15 text-foreground ring-1 ring-inset ring-destructive/40",
};

function Item({
  title,
  variant = "default",
  isStart = true,
  isEnd = true,
  isMiddle = false,
  onClick,
  className,
  style,
  children,
}: {
  title: string;
  variant?: string;
  isStart?: boolean;
  isEnd?: boolean;
  isMiddle?: boolean;
  onClick?: () => void;
  className?: string;
  /** Ground, hairline and ink, when the caller colours bars itself. Supersedes `variant`. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      // The bar must not start a drag-selection: dragging across events is how
      // somebody reads a week, not how they select one.
      onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
      title={title}
      style={style}
      className={cn(
        "block h-5 w-full truncate px-1.5 text-left text-[0.7rem] font-medium leading-5",
        // A caller-supplied style owns the colours outright; the variants are
        // the fallback for callers with nothing better to say.
        style ? undefined : ITEM_VARIANTS[variant] ?? ITEM_VARIANTS.default,
        // Only the real ends are rounded, so a run across a week reads as one
        // bar rather than as several.
        isStart ? "rounded-l-md" : "rounded-l-none",
        isEnd ? "rounded-r-md" : "rounded-r-none",
        isMiddle && "rounded-none",
        onClick && "cursor-pointer hover:brightness-110",
        className
      )}
    >
      {children ?? title}
    </Component>
  );
}


// MARK: - Time grid

/**
 * The week and day views: hours down the side, events placed against them.
 *
 * A different shape of answer from the month, and deliberately so. A month
 * answers "which days are busy"; a week answers "can I be in two places at
 * four o'clock", which needs the events drawn to scale against a clock.
 *
 * Anything spanning a whole day or crossing midnight goes in the strip above
 * the clock rather than being drawn as a 24-hour-tall block that pushes
 * everything else off the screen.
 */

const HOUR_HEIGHT = 48;
/** The clock always covers at least this, so a quiet day is not two rows tall. */
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21;

interface PlacedEvent {
  event: BigCalendarEvent;
  top: number;
  height: number;
  /** Fraction of the column, for events that overlap in time. */
  left: number;
  width: number;
}

function minutesInto(date: Date, day: Date): number {
  const start = startOfDay(day).getTime();
  return (date.getTime() - start) / 60_000;
}

/** True when this is a strip event: all day, or running past midnight. */
function isAllDay(event: BigCalendarEvent): boolean {
  const spansDays = !isSameDay(event.start, event.end);
  const wholeDay = event.end.getTime() - event.start.getTime() >= 23.5 * 3_600_000;
  return spansDays || wholeDay;
}

/**
 * Side-by-side columns for events that overlap in time.
 *
 * Greedy, and grouped: a run of mutually overlapping events shares a width, so
 * two events at four o'clock are each half a column rather than one being full
 * width with the other on top of it.
 */
function placeDay(events: BigCalendarEvent[], day: Date, startHour: number): PlacedEvent[] {
  const timed = events
    .filter((event) => !isAllDay(event))
    .filter(
      (event) => event.start <= endOfDay(day) && event.end >= startOfDay(day)
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const placed: PlacedEvent[] = [];
  let group: BigCalendarEvent[] = [];
  let groupEnd = 0;

  const flush = () => {
    if (!group.length) return;
    const columns: BigCalendarEvent[][] = [];
    for (const event of group) {
      const column = columns.find(
        (existing) => existing[existing.length - 1].end <= event.start
      );
      if (column) column.push(event);
      else columns.push([event]);
    }
    for (const [index, column] of columns.entries()) {
      for (const event of column) {
        const from = Math.max(minutesInto(event.start, day), startHour * 60);
        const to = Math.max(minutesInto(event.end, day), from + 20);
        placed.push({
          event,
          top: ((from - startHour * 60) / 60) * HOUR_HEIGHT,
          height: ((to - from) / 60) * HOUR_HEIGHT,
          left: index / columns.length,
          width: 1 / columns.length,
        });
      }
    }
    group = [];
  };

  for (const event of timed) {
    if (group.length && event.start.getTime() >= groupEnd) flush();
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end.getTime());
  }
  flush();

  return placed;
}

function TimeGrid({
  className,
  children,
  allDayChildren,
}: {
  className?: string;
  /** Renders one timed event, sized to its duration. */
  children: (event: BigCalendarEvent) => React.ReactNode;
  /** Renders one all-day or multi-day event in the strip. Falls back to `children`. */
  allDayChildren?: (event: BigCalendarEvent, position: SegmentPosition) => React.ReactNode;
}) {
  const { date, view, events, weekStartsOn, showWeekends, onDayClick } = useBigCalendar();

  const days = React.useMemo(() => {
    if (view === "day") return [startOfDay(date)];
    const first = startOfWeek(date, weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index)).filter(
      (day) => showWeekends || (day.getDay() !== 0 && day.getDay() !== 6)
    );
  }, [date, view, weekStartsOn, showWeekends]);

  const inView = React.useMemo(() => {
    const from = startOfDay(days[0]);
    const to = endOfDay(days[days.length - 1]);
    return events.filter((event) => event.start <= to && event.end >= from);
  }, [events, days]);

  // The clock stretches to hold whatever is actually on it, so a 7am practice
  // and an 11pm lock-in are both visible without scrolling past empty hours.
  const [startHour, endHour] = React.useMemo(() => {
    const timed = inView.filter((event) => !isAllDay(event));
    let from = DEFAULT_START_HOUR;
    let to = DEFAULT_END_HOUR;
    for (const event of timed) {
      from = Math.min(from, event.start.getHours());
      to = Math.max(to, event.end.getHours() + (event.end.getMinutes() > 0 ? 1 : 0));
    }
    return [Math.max(0, from), Math.min(24, Math.max(to, from + 4))];
  }, [inView]);

  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const allDay = inView.filter(isAllDay);

  const now = new Date();
  const showsNow = days.some((day) => isSameDay(day, now));
  const nowOffset = ((now.getHours() * 60 + now.getMinutes() - startHour * 60) / 60) * HOUR_HEIGHT;

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border", className)}>
      {/* Day headings, which double as the way into a single day. */}
      <div
        className="grid border-b bg-muted/50"
        style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div aria-hidden="true" />
        {days.map((day) => {
          const today = isSameDay(day, now);
          return (
            <button
              key={dayKey(day)}
              type="button"
              onClick={() => onDayClick?.(day)}
              className="flex flex-col items-center gap-0.5 border-l px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABELS[day.getDay()]}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums text-foreground",
                  today && "bg-primary text-primary-foreground"
                )}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {allDay.length ? (
        <div
          className="grid border-b"
          style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="px-2 py-1.5 text-right text-[0.7rem] font-medium text-muted-foreground">
            All day
          </div>
          <div
            className="grid gap-0.5 py-1.5"
            style={{
              gridColumn: `2 / -1`,
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            {allDay.map((event) => {
              const firstIndex = days.findIndex((day) => endOfDay(day) >= event.start);
              const lastIndex = days.reduce(
                (last, day, index) => (startOfDay(day) <= event.end ? index : last),
                0
              );
              const column = Math.max(0, firstIndex === -1 ? 0 : firstIndex);
              const span = Math.max(1, lastIndex - column + 1);
              const position: SegmentPosition = {
                isStart: event.start >= startOfDay(days[column]),
                isEnd: event.end <= endOfDay(days[column + span - 1]),
                isMiddle: false,
              };
              return (
                <div
                  key={event.id}
                  className="min-w-0 px-1"
                  style={{ gridColumn: `${column + 1} / span ${span}` }}
                >
                  {(allDayChildren ?? ((item) => children(item)))(event, {
                    ...position,
                    isMiddle: !position.isStart && !position.isEnd,
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* The clock. Scrolls on its own so the headings and the all-day strip
        * stay put, which is what makes a long day readable. */}
      {/* The pad is for the first hour's label, which sits above its own row
        * line and would otherwise be cropped by the scroll edge. */}
      <div className="relative max-h-[38rem] overflow-y-auto pt-2.5">
        <div
          className="grid"
          style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b text-right"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-2 right-2 bg-card px-1 text-[0.7rem] text-muted-foreground">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const placed = placeDay(inView, day, startHour);
            return (
              <div key={dayKey(day)} className="relative border-l">
                {hours.map((hour) => (
                  <div key={hour} className="border-b" style={{ height: HOUR_HEIGHT }} />
                ))}

                {isSameDay(day, now) && showsNow && nowOffset >= 0 ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                    style={{ top: nowOffset }}
                  >
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-destructive" />
                  </div>
                ) : null}

                {placed.map((item) => (
                  <div
                    key={item.event.id}
                    className="absolute z-10 px-0.5"
                    style={{
                      top: item.top,
                      height: Math.max(item.height, 18),
                      left: `${item.left * 100}%`,
                      width: `${item.width * 100}%`,
                    }}
                  >
                    {children(item.event)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "8 AM", "12 PM" — the way a clock label is read out loud. */
function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/**
 * One event in a time grid: a block as tall as it is long.
 *
 * Separate from `Item` because the constraints are different — a bar in a
 * month cell is one line high and truncates, while this has room for a time
 * and a place and has to survive being twenty minutes tall.
 */
function Block({
  title,
  subtitle,
  style,
  onClick,
  className,
}: {
  title: string;
  subtitle?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  className?: string;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={subtitle ? `${title} · ${subtitle}` : title}
      style={style}
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[0.7rem] leading-tight",
        style ? undefined : ITEM_VARIANTS.default,
        onClick && "cursor-pointer hover:brightness-110",
        className
      )}
    >
      <span className="truncate font-semibold">{title}</span>
      {subtitle ? <span className="truncate opacity-80">{subtitle}</span> : null}
    </Component>
  );
}

export const BigCalendar = { Root, Header, Grid, Item, TimeGrid, Block };
