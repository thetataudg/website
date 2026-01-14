"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";

type Committee = {
  _id: string;
  name: string;
  committeeHeadId?: { _id?: string } | string;
};

type EventItem = {
  _id: string;
  name: string;
  committeeId: string;
  status: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  eventType?: string;
};

type Member = {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
};

export default function CommitteeEventsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<{
    role: string;
    memberId: string;
    isECouncil: boolean;
  } | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingCheckIn, setPendingCheckIn] = useState<Member | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [showSeriesPrompt, setShowSeriesPrompt] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    eventType: "meeting",
    status: "scheduled",
    visibleToAlumni: true,
    recurrenceEnabled: false,
    recurrenceFrequency: "weekly",
    recurrenceInterval: "1",
    recurrenceEndDate: "",
    recurrenceCount: "1",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mstDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const mstDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formatMstDateTime = (value: string | Date) =>
    mstDateTimeFormatter.format(new Date(value));
  const formatMstDate = (value: string | Date) =>
    mstDateFormatter.format(new Date(value));

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/members/me");
      const meData = meRes.ok ? await meRes.json() : null;
      setMe(meData);

      const commRes = await fetch("/api/committees");
      const commData = commRes.ok ? await commRes.json() : [];
      setCommittees(commData);

      await reloadEvents();

      const memRes = await fetch("/api/members");
      const memData = memRes.ok ? await memRes.json() : [];
      setMembers(memData.filter((m: Member) => m.status === "Active"));

      setLoading(false);
    }
    if (isSignedIn) init();
  }, [isSignedIn]);

  async function reloadEvents() {
    const evRes = await fetch("/api/events?includePast=true");
    const evData = evRes.ok ? await evRes.json() : [];
    setEvents(evData);
  }

  const managedCommitteeIds = useMemo(() => {
    if (!me) return [];
    if (me.role === "admin" || me.role === "superadmin" || me.isECouncil) {
      return committees.map((c) => c._id);
    }
    return committees
      .filter((c) => {
        const headId =
          typeof c.committeeHeadId === "string"
            ? c.committeeHeadId
            : c.committeeHeadId?._id;
        return headId === me.memberId;
      })
      .map((c) => c._id);
  }, [me, committees]);

  const canAccessCommitteeEvents =
    !!me &&
    (me.role === "admin" ||
      me.role === "superadmin" ||
      me.isECouncil ||
      managedCommitteeIds.length > 0);

  const managedEvents = events.filter((e) =>
    managedCommitteeIds.includes(e.committeeId)
  );

  const selectedCommitteeEvents = selectedCommitteeId
    ? managedEvents.filter((e) => e.committeeId === selectedCommitteeId)
    : [];

  const selectedCommittee = committees.find((c) => c._id === selectedCommitteeId);

  async function loadEventDetails(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`);
    const data = res.ok ? await res.json() : null;
    setSelectedEvent(data);
  }

  async function addManualCheckIn(memberId: string) {
    if (!selectedEvent?._id) return;
    const res = await fetch(
      `/api/events/${selectedEvent._id}/manual-check-in`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      }
    );
    if (res.ok) {
      await loadEventDetails(selectedEvent._id);
      setQuery("");
    }
  }

  const matches = members.filter((m) => {
    const label = `${m.fName} ${m.lName} ${m.rollNo}`.toLowerCase();
    return query && label.includes(query.toLowerCase());
  });

  const updateForm = <K extends keyof typeof form>(key: K, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const resetForm = () =>
    setForm({
      name: "",
      description: "",
      startTime: "",
      endTime: "",
      location: "",
      eventType: "meeting",
      status: "scheduled",
      visibleToAlumni: true,
      recurrenceEnabled: false,
      recurrenceFrequency: "weekly",
      recurrenceInterval: "1",
      recurrenceEndDate: "",
      recurrenceCount: "1",
    });

  const mstFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function toMstInputValue(value: string | Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = mstFormatter.formatToParts(d);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
  }

  function toMstIso(value: string) {
    if (!value) return value;
    const [datePart, timePart] = value.split("T");
    if (!datePart || !timePart) return value;
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if ([year, month, day, hour, minute].some((v) => Number.isNaN(v))) return value;
    const utcMs = Date.UTC(year, month - 1, day, hour + 7, minute);
    return new Date(utcMs).toISOString();
  }

  function toDateInputValue(value: string | Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCommitteeId) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        committeeId: selectedCommitteeId,
        startTime: toMstIso(form.startTime),
        endTime: toMstIso(form.endTime),
        recurrence: {
          enabled: form.recurrenceEnabled,
          frequency: form.recurrenceFrequency,
          interval: Number(form.recurrenceInterval) || 1,
          endDate: form.recurrenceEndDate || null,
          count: Number(form.recurrenceCount) || 1,
        },
      }),
    });

    if (res.ok) {
      const created = await res.json();
      if (form.recurrenceEnabled && Number(form.recurrenceCount) > 1) {
        await reloadEvents();
      } else {
        setEvents((prev) => [created, ...prev]);
      }
      resetForm();
      setShowCreateModal(false);
      setFormMode("create");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create event");
    }
    setSaving(false);
  }

  async function handleSaveEdit(
    e: React.SyntheticEvent,
    scope?: "single" | "series"
  ) {
    e.preventDefault();
    if (!editId) return;
    const isRecurring =
      editEvent?.recurrence?.enabled || editEvent?.recurrenceParentId;
    if (!scope && isRecurring) {
      setShowSeriesPrompt(true);
      return;
    }
    setSaving(true);
    setError(null);

    const isAdmin =
      me?.role === "admin" || me?.role === "superadmin" || me?.isECouncil;
    const payload: any = {
      ...form,
      startTime: toMstIso(form.startTime),
      endTime: toMstIso(form.endTime),
      recurrence: {
        enabled: form.recurrenceEnabled,
        frequency: form.recurrenceFrequency,
        interval: Number(form.recurrenceInterval) || 1,
        endDate: form.recurrenceEndDate || null,
      },
    };
    if (isAdmin) {
      payload.committeeId = selectedCommitteeId || null;
    }

    const res = await fetch(`/api/events/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        applyToSeries: scope === "series" ? "series" : "single",
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      if (scope === "series") {
        await reloadEvents();
      } else {
        setEvents((prev) =>
          prev.map((evt) => (evt._id === updated._id ? updated : evt))
        );
      }
      if (selectedEvent?._id === updated._id) {
        setSelectedEvent(updated);
      }
      resetForm();
      setShowCreateModal(false);
      setFormMode("create");
      setEditId(null);
      setEditEvent(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update event");
    }
    setSaving(false);
  }

  async function startEdit(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`);
    const event = res.ok ? await res.json() : null;
    if (!event) return;

    setEditId(event._id);
    setEditEvent(event);
    setForm({
      name: event.name || "",
      description: event.description || "",
      startTime: toMstInputValue(event.startTime),
      endTime: toMstInputValue(event.endTime),
      location: event.location || "",
      eventType: event.eventType || "meeting",
      status: event.status || "scheduled",
      visibleToAlumni: !!event.visibleToAlumni,
      recurrenceEnabled: !!(event.recurrence?.enabled || event.recurrenceEnabled),
      recurrenceFrequency:
        event.recurrence?.frequency || event.recurrenceFrequency || "weekly",
      recurrenceInterval: String(
        event.recurrence?.interval || event.recurrenceInterval || 1
      ),
      recurrenceEndDate: event.recurrence?.endDate
        ? toDateInputValue(event.recurrence.endDate)
        : event.recurrenceEndDate || "",
      recurrenceCount: String(event.recurrence?.count || 1),
    });
    if (event.committeeId) {
      setSelectedCommitteeId(event.committeeId);
    }
    setSelectedEvent(null);
    setFormMode("edit");
    setShowCreateModal(true);
  }

  if (!isLoaded || loading) {
    return <LoadingState message="Loading committee events..." />;
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged into use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  if (!canAccessCommitteeEvents) {
    return (
      <div className="member-dashboard">
        <section className="bento-card">
          <h2>Committee Events</h2>
          <p className="text-muted">
            Only committee heads, E-Council, and admins can access this page.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="member-dashboard events-page">
      <section className="bento-card events-hero">
        <div>
          <div className="hero-eyebrow">Committee Tools</div>
          <h1 className="hero-title">Committee Events</h1>
          <p className="hero-subtitle">
            Manage events for your committee and keep attendance accurate.
          </p>
        </div>
      </section>

      <section className="bento-card">
        <div className="events-section__header">
          <div>
            <h2>Select a Committee</h2>
            <p className="text-muted">
              Choose a committee to view and manage its events.
            </p>
          </div>
        </div>
        <div className="row g-3 align-items-end">
          <div className="col-lg-6">
            <label className="form-label">Committee</label>
            <select
              className="form-select"
              value={selectedCommitteeId}
              onChange={(e) => {
                setSelectedCommitteeId(e.target.value);
                setSelectedEvent(null);
                setQuery("");
              }}
            >
              <option value="">Choose a committee</option>
              {managedCommitteeIds.map((id) => {
                const committee = committees.find((c) => c._id === id);
                return (
                  <option key={id} value={id}>
                    {committee?.name || "Committee"}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="col-lg-6 text-lg-end">
            <button
              className="btn btn-primary"
              disabled={!selectedCommitteeId}
              onClick={() => {
                resetForm();
                setFormMode("create");
                setEditId(null);
                setShowCreateModal(true);
              }}
            >
              Create New Event
            </button>
          </div>
        </div>
      </section>

      <section className="events-section bento-card">
        <div className="events-section__header">
          <div>
            <h2>{selectedCommittee?.name || "Committee"} Events</h2>
            <p className="text-muted">
              {selectedCommitteeId
                ? "Click an event to review details or add attendees."
                : "Select a committee to see its events."}
            </p>
          </div>
          <span className="events-count">
            {selectedCommitteeEvents.length} events
          </span>
        </div>

        {selectedCommitteeId ? (
          selectedCommitteeEvents.length ? (
            <div className="events-grid">
              {selectedCommitteeEvents.map((evt) => (
                <button
                  type="button"
                  key={evt._id}
                  className="event-card text-start"
                  onClick={() => loadEventDetails(evt._id)}
                >
                  <div className="event-card__header">
                    <div className="event-card__title-block">
                      <h3 className="event-card__title">{evt.name}</h3>
                      <div className="event-card__meta event-card__meta--split">
                        <span className="event-pill event-pill--type">
                          {(evt.eventType || "event").toUpperCase()}
                        </span>
                        <span
                          className={`event-pill event-pill--status status-${
                            evt.status || "scheduled"
                          }`}
                        >
                          {(evt.status || "scheduled").toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <span className="event-pill event-pill--full">
                      {formatMstDate(evt.startTime)}
                    </span>
                  </div>
                  <p className="event-card__description">
                    {evt.description || "No description added yet."}
                  </p>
                  <div className="event-card__details">
                    <div>
                      <span className="event-detail-label">Start</span>
                      <span>{formatMstDateTime(evt.startTime)}</span>
                    </div>
                    <div>
                      <span className="event-detail-label">End</span>
                      <span>{formatMstDateTime(evt.endTime)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted">No events for this committee yet.</p>
          )
        ) : (
          <p className="text-muted">Pick a committee to get started.</p>
        )}
      </section>

      {showCreateModal && (
        <div
          className="modal fade show event-modal"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {formMode === "edit" ? "Edit Event" : "Create Committee Event"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditEvent(null);
                  }}
                />
              </div>
              <form
                onSubmit={(e) =>
                  formMode === "edit" ? handleSaveEdit(e) : handleCreateEvent(e)
                }
              >
                <div className="modal-body">
                  {error && <div className="alert alert-danger">{error}</div>}
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Event Name</label>
                      <input
                        className="form-control"
                        value={form.name}
                        onChange={(e) => updateForm("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Location</label>
                      <input
                        className="form-control"
                        value={form.location}
                        onChange={(e) => updateForm("location", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Event Type</label>
                      <select
                        className="form-select"
                        value={form.eventType}
                        onChange={(e) => updateForm("eventType", e.target.value)}
                      >
                        <option value="meeting">Meeting</option>
                        <option value="event">Event</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        value={form.status}
                        onChange={(e) => updateForm("status", e.target.value)}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={form.description}
                        onChange={(e) => updateForm("description", e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Start Time</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={form.startTime}
                        onChange={(e) => updateForm("startTime", e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">End Time</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={form.endTime}
                        onChange={(e) => updateForm("endTime", e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-12">
                      <div className="form-check">
                        <input
                          id="committeeVisibleToAlumni"
                          className="form-check-input"
                          type="checkbox"
                          checked={form.visibleToAlumni}
                          onChange={(e) =>
                            updateForm("visibleToAlumni", e.target.checked)
                          }
                        />
                        <label
                          htmlFor="committeeVisibleToAlumni"
                          className="form-check-label"
                        >
                          Visible to alumni
                        </label>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-check">
                        <input
                          id="committeeRepeatEvent"
                          className="form-check-input"
                          type="checkbox"
                          checked={form.recurrenceEnabled}
                          onChange={(e) =>
                            updateForm("recurrenceEnabled", e.target.checked)
                          }
                        />
                        <label
                          htmlFor="committeeRepeatEvent"
                          className="form-check-label"
                        >
                          Repeat this event
                        </label>
                      </div>
                    </div>
                    {form.recurrenceEnabled && (
                      <>
                        <div className="col-md-6">
                          <label className="form-label">Frequency</label>
                          <select
                            className="form-select"
                            value={form.recurrenceFrequency}
                            onChange={(e) =>
                              updateForm("recurrenceFrequency", e.target.value)
                            }
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Repeat every</label>
                          <input
                            type="number"
                            min={1}
                            className="form-control"
                            value={form.recurrenceInterval}
                            onChange={(e) =>
                              updateForm("recurrenceInterval", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Ends on</label>
                          <input
                            type="date"
                            className="form-control"
                            value={form.recurrenceEndDate}
                            onChange={(e) =>
                              updateForm("recurrenceEndDate", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Generate next N</label>
                          <input
                            type="number"
                            min={1}
                            className="form-control"
                            value={form.recurrenceCount}
                            onChange={(e) =>
                              updateForm("recurrenceCount", e.target.value)
                            }
                          />
                          <div className="form-text">
                            Creates the next N occurrences now. More generate as
                            events complete.
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditEvent(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={saving}>
                    {saving
                      ? formMode === "edit"
                        ? (
                          <>
                            <LoadingSpinner size="sm" className="me-2" />
                            Saving...
                          </>
                        )
                        : (
                          <>
                            <LoadingSpinner size="sm" className="me-2" />
                            Creating...
                          </>
                        )
                      : formMode === "edit"
                      ? "Save Changes"
                      : "Create Event"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div
          className="modal fade show event-modal"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{selectedEvent.name}</h5>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => startEdit(selectedEvent._id)}
                  >
                    Edit Event
                  </button>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setSelectedEvent(null);
                      setQuery("");
                    }}
                  />
                </div>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="event-pill event-pill--type">
                      {(selectedEvent.eventType || "event").toUpperCase()}
                    </div>
                  </div>
                  <div className="col-md-6 text-md-end">
                    <div
                      className={`event-pill event-pill--status status-${
                        selectedEvent.status || "scheduled"
                      }`}
                    >
                      {(selectedEvent.status || "scheduled").toUpperCase()}
                    </div>
                  </div>
                  <div className="col-12">
                    <p className="event-card__description">
                      {selectedEvent.description || "No description added yet."}
                    </p>
                  </div>
                  <div className="col-md-6">
                    <div className="event-detail-label">Start</div>
                    <div>{formatMstDateTime(selectedEvent.startTime)}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="event-detail-label">End</div>
                    <div>{formatMstDateTime(selectedEvent.endTime)}</div>
                  </div>
                  <div className="col-12">
                    <div className="event-detail-label">Location</div>
                    <div>{selectedEvent.location || "TBD"}</div>
                  </div>
                  <div className="col-12">
                    <div className="event-detail-label">Add attendee</div>
                    <input
                      className="form-control checkin-input"
                      placeholder="Type a name or roll number"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {matches.length > 0 && (
                      <div className="list-group checkin-matches">
                        {matches.slice(0, 8).map((m) => (
                          <button
                            type="button"
                            key={m._id}
                            className="list-group-item list-group-item-action"
                            onClick={() => setPendingCheckIn(m)}
                          >
                            {m.fName} {m.lName} (#{m.rollNo})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-12">
                    <div className="event-detail-label">
                      Attendees ({selectedEvent.attendees?.length || 0})
                    </div>
                    {selectedEvent.attendees?.length ? (
                      <div className="table-responsive">
                        <table className="table admin-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th className="text-end">Checked In At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedEvent.attendees.map((entry: any) => (
                              <tr key={entry.memberId?._id || entry.checkedInAt}>
                                <td>
                                  {entry.memberId?.fName} {entry.memberId?.lName} (#
                                  {entry.memberId?.rollNo})
                                </td>
                                <td className="text-end text-muted">
                                  {entry.checkedInAt
                                    ? formatMstDateTime(entry.checkedInAt)
                                    : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-muted">No check-ins recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingCheckIn && (
        <div
          className="modal fade show event-modal"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Check-In</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setPendingCheckIn(null)}
                />
              </div>
              <div className="modal-body">
                <p>
                  Add {pendingCheckIn.fName} {pendingCheckIn.lName} (#
                  {pendingCheckIn.rollNo}) to this event?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setPendingCheckIn(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={async () => {
                    await addManualCheckIn(pendingCheckIn._id);
                    setPendingCheckIn(null);
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSeriesPrompt && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Apply changes</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowSeriesPrompt(false)}
                />
              </div>
              <div className="modal-body">
                <p>Apply these changes to just this event or all future events?</p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={(e) => {
                    setShowSeriesPrompt(false);
                    handleSaveEdit(e, "single");
                  }}
                >
                  Just this event
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={(e) => {
                    setShowSeriesPrompt(false);
                    handleSaveEdit(e, "series");
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
