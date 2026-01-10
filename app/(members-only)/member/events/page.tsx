"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faList,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { addRecurrence } from "@/lib/recurrence";
import LoadingState from "../../components/LoadingState";

type EventItem = {
  _id: string;
  name: string;
  description?: string;
  committeeId?: string | null;
  eventType?: "meeting" | "event" | "chapter";
  recurrence?: {
    enabled?: boolean;
    frequency?: "daily" | "weekly" | "monthly";
    interval?: number;
    endDate?: string | null;
    count?: number;
  };
  recurrenceParentId?: string;
  recurrenceEnabled?: boolean;
  startTime: string;
  endTime: string;
  location?: string;
  gemPointDurationMinutes?: number;
  status: string;
  visibleToAlumni: boolean;
};

type Committee = {
  _id: string;
  name: string;
  committeeHeadId?: { _id?: string; fName?: string; lName?: string; rollNo?: string } | string;
  committeeMembers?: ({ _id?: string } | string)[];
};

export default function EventsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<{
    role: string;
    status: string;
    memberId: string;
    isCommitteeHead: boolean;
    isECouncil: boolean;
  } | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [includePast, setIncludePast] = useState(false);
  const [summaryEvent, setSummaryEvent] = useState<any>(null);
  const [pendingStatus, setPendingStatus] = useState<{
    event: EventItem;
    status: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setMe({
          role: data.role,
          status: data.status,
          memberId: data.memberId,
          isCommitteeHead: data.isCommitteeHead,
          isECouncil: data.isECouncil,
        });
      } catch {
        setMe(null);
      }
    }
    if (isSignedIn) init();
  }, [isSignedIn]);

  useEffect(() => {
    async function loadCommittees() {
      const res = await fetch("/api/committees");
      if (!res.ok) return;
      const data = await res.json();
      setCommittees(data);
    }

    if (me) {
      Promise.all([loadCommittees(), reloadEvents()]).finally(() =>
        setLoading(false)
      );
    }
  }, [me]);

  async function reloadEvents() {
    const res = await fetch("/api/events?includePast=true");
    if (!res.ok) return;
    const data = await res.json();
    setEvents(data);
  }

  async function fetchEventDetails(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return null;
    return await res.json();
  }

  async function viewAttendance(eventId: string) {
    const details = await fetchEventDetails(eventId);
    if (details) setSummaryEvent(details);
  }

  async function updateEventStatus(
    eventId: string,
    status: string,
    applyToSeries?: "single" | "series"
  ) {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        applyToSeries: applyToSeries === "series" ? "series" : "single",
      }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    if (applyToSeries === "series") {
      await reloadEvents();
    } else {
      setEvents((prev) =>
        prev.map((evt) => (evt._id === eventId ? updated : evt))
      );
    }
    if (status === "completed") {
      const details = await fetchEventDetails(eventId);
      if (details) setSummaryEvent(details);
    }
  }

  const shiftCalendar = (direction: number) => {
    setCalendarDate((prev) => {
      const next = new Date(prev);
      if (calendarView === "month") {
        next.setMonth(next.getMonth() + direction);
      } else {
        next.setDate(next.getDate() + direction * 7);
      }
      return next;
    });
  };

  const escapeIcsText = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");

  const toIcsDate = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
      date.getUTCDate()
    )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
      date.getUTCSeconds()
    )}Z`;
  };

  const handleDownloadCalendar = () => {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Delta Gamma//Events//EN",
    ];
    const stamp = toIcsDate(new Date());

    calendarEvents.forEach((evt) => {
      const uidBase = `${evt._id}-${new Date(evt.startTime).toISOString()}`;
      const uid = uidBase.replace(/[^a-zA-Z0-9-]/g, "") + "@deltagamma";
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toIcsDate(new Date(evt.startTime))}`,
        `DTEND:${toIcsDate(new Date(evt.endTime))}`,
        `SUMMARY:${escapeIcsText(evt.name)}`,
        `DESCRIPTION:${escapeIcsText(evt.description || "")}`,
        `LOCATION:${escapeIcsText(evt.location || "")}`,
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `events-${formatDateKey(rangeStart)}-${formatDateKey(
      rangeEnd
    )}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const memberCommitteeIds = committees
    .filter((c) => {
      const headId =
        typeof c.committeeHeadId === "string"
          ? c.committeeHeadId
          : c.committeeHeadId?._id;
      const memberIds =
        c.committeeMembers?.map((m) =>
          typeof m === "string" ? m : m._id || ""
        ) || [];
      return headId === me?.memberId || memberIds.includes(me?.memberId || "");
    })
    .map((c) => c._id);

  const committeeLookup = new Map(committees.map((c) => [c._id, c.name]));

  const resolveEventType = (event: EventItem) =>
    event.eventType || (event.committeeId ? "event" : "chapter");

  const isMyEvent = (event: EventItem) =>
    resolveEventType(event) === "chapter" ||
    (event.committeeId ? memberCommitteeIds.includes(event.committeeId) : false);

  const collapseRecurring = (list: EventItem[]) => {
    const now = new Date();
    const seriesMap = new Map<
      string,
      { upcoming?: EventItem; latestPast?: EventItem }
    >();
    const standalone: EventItem[] = [];

    list.forEach((evt) => {
      const seriesKey =
        evt.recurrenceParentId ||
        (evt.recurrence?.enabled || evt.recurrenceEnabled ? evt._id : null);
      if (!seriesKey) {
        standalone.push(evt);
        return;
      }
      const start = new Date(evt.startTime);
      const end = new Date(evt.endTime);
      const entry = seriesMap.get(seriesKey) || {};

      if (end >= now) {
        if (!entry.upcoming || start < new Date(entry.upcoming.startTime)) {
          entry.upcoming = evt;
        }
      } else if (includePast) {
        if (!entry.latestPast || end > new Date(entry.latestPast.endTime)) {
          entry.latestPast = evt;
        }
      }
      seriesMap.set(seriesKey, entry);
    });

    const collapsed = Array.from(seriesMap.values())
      .map((entry) => entry.upcoming || entry.latestPast)
      .filter(Boolean) as EventItem[];

    return [...standalone, ...collapsed].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  };

  const formatDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

  const startOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const startOfWeek = (date: Date) => {
    const d = startOfDay(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
  };

  const endOfWeek = (date: Date) => {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    return endOfDay(d);
  };

  const startOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1);

  const endOfMonth = (date: Date) =>
    endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));

  const buildDaysInRange = (start: Date, end: Date) => {
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  };

  const buildCalendarEvents = useMemo(() => {
    const rangeStart =
      calendarView === "month"
        ? startOfWeek(startOfMonth(calendarDate))
        : startOfWeek(calendarDate);
    const rangeEnd =
      calendarView === "month"
        ? endOfWeek(endOfMonth(calendarDate))
        : endOfWeek(calendarDate);
    const now = new Date();

    const overlapsRange = (evt: EventItem) => {
      const start = new Date(evt.startTime);
      const end = new Date(evt.endTime);
      return start <= rangeEnd && end >= rangeStart;
    };

    const actualEvents = events.filter(
      (evt) => overlapsRange(evt) && (includePast || new Date(evt.endTime) >= now)
    );
    const existingKeys = new Set<string>();
    actualEvents.forEach((evt) => {
      const seriesKey =
        evt.recurrenceParentId ||
        (evt.recurrence?.enabled || evt.recurrenceEnabled ? evt._id : null);
      const key = seriesKey
        ? `${seriesKey}:${new Date(evt.startTime).toISOString()}`
        : evt._id;
      existingKeys.add(key);
    });

    const generated: EventItem[] = [];
    const parents = events.filter(
      (evt) => (evt.recurrence?.enabled || evt.recurrenceEnabled) && !evt.recurrenceParentId
    );

    parents.forEach((parent) => {
      const recurrence = parent.recurrence;
      if (!recurrence?.enabled) return;

      const endDate = recurrence.endDate ? new Date(recurrence.endDate) : null;
      let cursorStart = new Date(parent.startTime);
      let cursorEnd = new Date(parent.endTime);

      while (cursorEnd < rangeStart) {
        const next = addRecurrence(cursorStart, cursorEnd, {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          endDate,
        });
        if (!next) return;
        cursorStart = next.startTime;
        cursorEnd = next.endTime;
      }

      while (cursorStart <= rangeEnd) {
        const key = `${parent._id}:${cursorStart.toISOString()}`;
        if (
          !existingKeys.has(key) &&
          (includePast || cursorEnd >= now)
        ) {
          generated.push({
            ...parent,
            _id: `${parent._id}-${cursorStart.toISOString()}`,
            startTime: cursorStart.toISOString(),
            endTime: cursorEnd.toISOString(),
            recurrenceParentId: parent._id,
          });
        }
        const next = addRecurrence(cursorStart, cursorEnd, {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          endDate,
        });
        if (!next) break;
        cursorStart = next.startTime;
        cursorEnd = next.endTime;
      }
    });

    const fullList = [...actualEvents, ...generated].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return { rangeStart, rangeEnd, events: fullList };
  }, [calendarDate, calendarView, events, includePast]);

  const now = new Date();
  const visibleEvents = includePast
    ? events
    : events.filter((evt) => new Date(evt.endTime) >= now);

  const myEvents = collapseRecurring(
    visibleEvents.filter(isMyEvent)
  );

  const otherEvents = collapseRecurring(
    visibleEvents.filter((event) => !isMyEvent(event))
  );

  const { rangeStart, rangeEnd, events: calendarEvents } = buildCalendarEvents;

  const calendarDays = useMemo(
    () => buildDaysInRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    calendarEvents.forEach((evt) => {
      const key = formatDateKey(new Date(evt.startTime));
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(evt);
      } else {
        map.set(key, [evt]);
      }
    });
    return map;
  }, [calendarEvents, formatDateKey]);

  const selectedEvents = selectedDate
    ? eventsByDate.get(formatDateKey(selectedDate)) || []
    : [];

  const canManageEvent = (event: EventItem) => {
    if (me?.role === "admin" || me?.role === "superadmin" || me?.isECouncil) {
      return true;
    }
    if (!event.committeeId) return false;
    const committee = committees.find((c) => c._id === event.committeeId);
    const headId =
      typeof committee?.committeeHeadId === "string"
        ? committee?.committeeHeadId
        : committee?.committeeHeadId?._id;
    return headId === me?.memberId;
  };

  const getCommitteeLabel = (event: EventItem) => {
    if (event.eventType === "chapter" || !event.committeeId) return "Chapter";
    return committeeLookup.get(event.committeeId) || "Committee";
  };

  const getEventTypeLabel = (eventType?: EventItem["eventType"]) => {
    if (eventType === "meeting") return "Meeting";
    if (eventType === "chapter") return "Chapter";
    return "Event";
  };

  const renderEventCard = (evt: EventItem) => (
    <div className="event-card" key={evt._id}>
      <div className="event-card__header">
        <h3 className="event-card__title">{evt.name}</h3>
        <span className={`event-pill event-pill--status status-${evt.status}`}>
          {evt.status}
        </span>
      </div>
      <div className="event-card__meta">
        <span className="event-pill event-pill--type event-pill--full">
          {getEventTypeLabel(resolveEventType(evt))}
        </span>
        {evt.recurrence?.enabled ||
        evt.recurrenceEnabled ||
        evt.recurrenceParentId ? (
          <span className="event-pill event-pill--recurring">Recurring</span>
        ) : null}
        <span className="event-meta">Committee: {getCommitteeLabel(evt)}</span>
      </div>
      <p className="event-card__description">
        {evt.description || "No description"}
      </p>
      <div className="event-card__details">
        <div>
          <span className="event-detail-label">Start</span>
          <span>{new Date(evt.startTime).toLocaleString()}</span>
        </div>
        <div>
          <span className="event-detail-label">End</span>
          <span>{new Date(evt.endTime).toLocaleString()}</span>
        </div>
        {evt.location && (
          <div>
            <span className="event-detail-label">Location</span>
            <span>{evt.location}</span>
          </div>
        )}
      </div>
      {canManageEvent(evt) && (
        <div className="event-card__actions">
          {evt.status === "scheduled" && (
            <>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => updateEventStatus(evt._id, "ongoing")}
              >
                Start Event
              </button>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => {
                  const isRecurring =
                    evt.recurrence?.enabled ||
                    evt.recurrenceEnabled ||
                    evt.recurrenceParentId;
                  if (isRecurring) {
                    setPendingStatus({ event: evt, status: "cancelled" });
                  } else {
                    updateEventStatus(evt._id, "cancelled");
                  }
                }}
              >
                Cancel Event
              </button>
            </>
          )}
          {evt.status === "ongoing" && (
            <>
              <a
                className="btn btn-outline-secondary btn-sm"
                href={`/member/events/${evt._id}/check-in`}
              >
                Start Check-In
              </a>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => updateEventStatus(evt._id, "completed")}
              >
                End Event
              </button>
            </>
          )}
          {evt.status === "completed" && (
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => viewAttendance(evt._id)}
            >
              View Attendance
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!isLoaded || loading) {
    return <LoadingState message="Loading events..." />;
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged into use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard events-page">
      <section className="bento-card events-hero">
        <div>
          <div className="hero-eyebrow">
            <FontAwesomeIcon icon={faCalendar} />
            Events & gatherings
          </div>
          <h1 className="hero-title">Events</h1>
          <p className="hero-subtitle">
            Track meetings, chapter events, and committee plans.
          </p>
        </div>
        <div className="events-hero__controls d-flex flex-wrap gap-3 align-items-center">
          <div className="btn-group" role="group" aria-label="View">
            <button
              type="button"
              className={`btn btn-lg ${
                viewMode === "list" ? "btn-primary" : "btn-outline-secondary"
              }`}
              onClick={() => setViewMode("list")}
              aria-label="Card view"
              title="Card view"
            >
              <FontAwesomeIcon icon={faList} />
            </button>
            <button
              type="button"
              className={`btn btn-lg ${
                viewMode === "calendar" ? "btn-primary" : "btn-outline-secondary"
              }`}
              onClick={() => setViewMode("calendar")}
              aria-label="Calendar view"
              title="Calendar view"
            >
              <FontAwesomeIcon icon={faCalendar} />
            </button>
          </div>

          <label className="events-toggle" htmlFor="includePast">
            <input
              id="includePast"
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
            />
            <span className="events-toggle__track" aria-hidden="true">
              <span className="events-toggle__thumb" />
            </span>
            <span className="events-toggle__label">Show past events</span>
          </label>
        </div>
      </section>

      {viewMode === "calendar" && (
        <section className="bento-card events-section calendar-controls">
          <div className="events-section__header">
            <div>
              <h2>Calendar controls</h2>
              <p className="text-muted">Switch views, move the date range, or export.</p>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <div className="btn-group" role="group">
              <button
                type="button"
                className={`btn btn-lg ${
                  calendarView === "month"
                    ? "btn-primary"
                    : "btn-outline-secondary"
                }`}
                onClick={() => setCalendarView("month")}
              >
                Month
              </button>
              <button
                type="button"
                className={`btn btn-lg ${
                  calendarView === "week"
                    ? "btn-primary"
                    : "btn-outline-secondary"
                }`}
                onClick={() => setCalendarView("week")}
              >
                Week
              </button>
            </div>
            <div className="btn-group" role="group">
              <button
                type="button"
                className="btn btn-lg btn-outline-secondary"
                onClick={() => shiftCalendar(-1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn btn-lg btn-outline-secondary"
                onClick={() => setCalendarDate(new Date())}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-lg btn-outline-secondary"
                onClick={() => shiftCalendar(1)}
              >
                Next
              </button>
            </div>
            <button
              type="button"
              className="btn btn-lg btn-outline-secondary"
              onClick={handleDownloadCalendar}
            >
              Download .ics
            </button>
          </div>
        </section>
      )}

      {viewMode === "list" ? (
        <>
          <section className="bento-card events-section">
            <div className="events-section__header">
              <div>
                <h2>My events</h2>
                <p className="text-muted">
                  Your committee events plus chapter-wide updates.
                </p>
              </div>
              <span className="events-count">{myEvents.length} events</span>
            </div>
            {myEvents.length ? (
              <div className="events-grid">
                {myEvents.map(renderEventCard)}
              </div>
            ) : (
              <p className="text-muted">No events assigned to your committees yet.</p>
            )}
          </section>

          <section className="bento-card events-section">
            <div className="events-section__header">
              <div>
                <h2>Other events</h2>
                <p className="text-muted">
                  Everything else happening around the chapter.
                </p>
              </div>
              <span className="events-count">{otherEvents.length} events</span>
            </div>
            {otherEvents.length ? (
              <div className="events-grid">
                {otherEvents.map(renderEventCard)}
              </div>
            ) : (
              <p className="text-muted">No other events right now.</p>
            )}
          </section>
        </>
      ) : (
        <section className="bento-card events-section">
          <div className="events-section__header">
            <div>
              <h2>Calendar</h2>
              <p className="text-muted">
                {calendarView === "month"
                  ? calendarDate.toLocaleString(undefined, {
                      month: "long",
                      year: "numeric",
                    })
                  : `Week of ${startOfWeek(calendarDate).toLocaleDateString()}`}
              </p>
            </div>
            <span className="events-count">{calendarEvents.length} events</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="calendar-weekday text-uppercase small">
                {label}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            {calendarDays.map((day) => {
              const key = formatDateKey(day);
              const dayEvents = eventsByDate.get(key) || [];
              const isCurrentMonth =
                day.getMonth() === calendarDate.getMonth() ||
                calendarView === "week";
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className="calendar-day-card text-start"
                  style={{
                    minHeight: "140px",
                    padding: "10px",
                    borderRadius: "16px",
                    opacity: isCurrentMonth ? 1 : 0.5,
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="calendar-day-number fw-semibold">
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="calendar-day-count">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {dayEvents.slice(0, 3).map((evt) => (
                      <span
                        key={`${evt._id}-${evt.startTime}`}
                        className="event-pill event-pill--type event-pill--full"
                        style={{ textTransform: "none" }}
                      >
                        {evt.name}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-muted small">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selectedDate && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedDate(null)}
                />
              </div>
              <div className="modal-body">
                {selectedEvents.length ? (
                  <div className="list-group calendar-day-detail">
                    {selectedEvents.map((evt) => (
                      <div
                        key={`${evt._id}-${evt.startTime}`}
                        className="list-group-item"
                      >
                        <div className="d-flex justify-content-between">
                          <strong>{evt.name}</strong>
                          <span className="text-muted">
                            {new Date(evt.startTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            -{" "}
                            {new Date(evt.endTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="text-muted">
                          {getEventTypeLabel(resolveEventType(evt))} ·{" "}
                          {getCommitteeLabel(evt)}
                        </div>
                        {evt.location && (
                          <div className="text-muted">{evt.location}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No events on this date.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {summaryEvent && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Event Summary</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSummaryEvent(null)}
                />
              </div>
              <div className="modal-body">
                <h6>{summaryEvent.name}</h6>
                <p className="text-muted">
                  Total checked in: {summaryEvent.attendees?.length || 0}
                </p>
                {summaryEvent.attendees?.length ? (
                  <ul className="list-group">
                    {summaryEvent.attendees.map((entry: any) => (
                      <li
                        key={entry.memberId?._id || entry.checkedInAt}
                        className="list-group-item d-flex justify-content-between align-items-center"
                      >
                        <span>
                          {entry.memberId?.fName} {entry.memberId?.lName} (#
                          {entry.memberId?.rollNo})
                        </span>
                        <span className="text-muted">
                          {entry.checkedInAt
                            ? new Date(entry.checkedInAt).toLocaleString()
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">No check-ins recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingStatus && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Cancel recurring event</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setPendingStatus(null)}
                />
              </div>
              <div className="modal-body">
                <p>
                  Cancel just this event or all future events in the series?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    updateEventStatus(
                      pendingStatus.event._id,
                      pendingStatus.status,
                      "single"
                    );
                    setPendingStatus(null);
                  }}
                >
                  Just this event
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    updateEventStatus(
                      pendingStatus.event._id,
                      pendingStatus.status,
                      "series"
                    );
                    setPendingStatus(null);
                  }}
                >
                  All future events
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
