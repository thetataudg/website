"use client";

import React, { useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

type EventItem = {
  _id: string;
  name: string;
  description?: string;
  committeeId?: string | null;
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

  const sortedEvents = [...events]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .sort((a, b) => {
      const aMine = memberCommitteeIds.includes(a.committeeId);
      const bMine = memberCommitteeIds.includes(b.committeeId);
      if (aMine === bMine) return 0;
      return aMine ? -1 : 1;
    });

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

  return (
    <div className="container-xxl mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Events</h1>
        <div className="form-check">
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

      <div className="row g-4">
        {sortedEvents.map((evt) => (
          <div className="col-md-6 col-lg-4" key={evt._id}>
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">{evt.name}</h5>
                <p className="card-text text-muted">{evt.description || "No description"}</p>
                <p className="mb-1">
                  <strong>Start:</strong>{" "}
                  {new Date(evt.startTime).toLocaleString()}
                </p>
                <p className="mb-1">
                  <strong>End:</strong> {new Date(evt.endTime).toLocaleString()}
                </p>
                {evt.location && (
                  <p className="mb-1">
                    <strong>Location:</strong> {evt.location}
                  </p>
                )}
                <p className="mb-1">
                  <strong>Status:</strong> {evt.status}
                </p>
                <p className="mb-2">
                  <strong>Gem Points:</strong> {evt.gemPointDurationMinutes || 0} mins
                </p>
                {canManageEvent(evt) && (
                  <div className="d-flex flex-wrap gap-2">
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
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="text-muted">No events found.</div>
        )}
      </div>

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
