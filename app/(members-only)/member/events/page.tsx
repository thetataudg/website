"use client";

import React, { useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

type EventItem = {
  _id: string;
  name: string;
  description?: string;
  committeeId?: string | null;
  eventType?: "meeting" | "event" | "chapter";
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

    async function loadEvents() {
      const res = await fetch(`/api/events?includePast=${includePast}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data);
    }

    if (me) {
      Promise.all([loadCommittees(), loadEvents()]).finally(() =>
        setLoading(false)
      );
    }
  }, [me, includePast]);

  async function fetchEventDetails(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return null;
    return await res.json();
  }

  async function updateEventStatus(eventId: string, status: string) {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setEvents((prev) =>
      prev.map((evt) => (evt._id === eventId ? updated : evt))
    );
    if (status === "completed") {
      const details = await fetchEventDetails(eventId);
      if (details) setSummaryEvent(details);
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="container">
        <div
          className="alert alert-info d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
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

  const myEvents = events
    .filter(isMyEvent)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const otherEvents = events
    .filter((event) => !isMyEvent(event))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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
        {evt.recurrence?.enabled || evt.recurrenceEnabled ? (
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
                onClick={() => updateEventStatus(evt._id, "cancelled")}
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
        </div>
      )}
    </div>
  );

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
        <div className="events-hero__controls">
          <div className="form-check form-switch">
            <input
              id="includePast"
              className="form-check-input"
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
            />
            <label htmlFor="includePast" className="form-check-label">
              Show past events
            </label>
          </div>
        </div>
      </section>

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
    </div>
  );
}
