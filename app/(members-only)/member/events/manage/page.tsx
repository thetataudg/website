"use client";

import React, { useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";

type Committee = {
  _id: string;
  name: string;
  committeeHeadId?: { _id?: string; fName?: string; lName?: string; rollNo?: string } | string;
};

export default function EventCreatorPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<{
    role: string;
    memberId: string;
    isECouncil: boolean;
  } | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSeriesPrompt, setShowSeriesPrompt] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    committeeId: "",
    startTime: "",
    endTime: "",
    location: "",
    eventType: "event",
    status: "scheduled",
    visibleToAlumni: true,
    chapterWide: false,
    recurrenceEnabled: false,
    recurrenceFrequency: "weekly",
    recurrenceInterval: "1",
    recurrenceEndDate: "",
    recurrenceCount: "1",
  });

  const canCreate =
    me?.role === "admin" || me?.role === "superadmin" || me?.isECouncil;

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setMe({
          role: data.role,
          memberId: data.memberId,
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

  const updateForm = <K extends keyof typeof form>(key: K, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const resetForm = () =>
    setForm({
      name: "",
      description: "",
      committeeId: "",
      startTime: "",
      endTime: "",
      location: "",
      eventType: "event",
      status: "scheduled",
      visibleToAlumni: true,
      chapterWide: false,
      recurrenceEnabled: false,
      recurrenceFrequency: "weekly",
      recurrenceInterval: "1",
      recurrenceEndDate: "",
      recurrenceCount: "1",
    });

  const normalizeEventType = (event: any, fallback?: string) => {
    if (event?.eventType) return event.eventType;
    if (fallback) return fallback;
    return event?.committeeId ? "event" : "chapter";
  };

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        committeeId: form.chapterWide ? null : form.committeeId || null,
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
      const normalized = {
        ...created,
        eventType: normalizeEventType(created, form.eventType),
      };
      if (form.recurrenceEnabled && Number(form.recurrenceCount) > 1) {
        await reloadEvents();
      } else {
        setEvents((prev) => [normalized, ...prev]);
      }
      resetForm();
      setShowModal(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create event");
    }
    setSaving(false);
  }

  const visibleCommittees = committees;

  const managedCommitteeIds = visibleCommittees.map((c) => c._id);
  const managedEvents =
    me?.role === "admin" || me?.role === "superadmin" || me?.isECouncil
      ? events
      : events.filter((evt) => managedCommitteeIds.includes(evt.committeeId));

  function toInputValue(value: string | Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toDateInputValue(value: string | Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function startEdit(eventOrId: any) {
    const eventId = typeof eventOrId === "string" ? eventOrId : eventOrId?._id;
    let event = typeof eventOrId === "object" ? eventOrId : null;

    if (eventId) {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        event = await res.json();
      }
    }

    if (!event) return;

    setEditId(event._id);
    setEditEvent(event);
    setForm({
      name: event.name || "",
      description: event.description || "",
      committeeId: event.committeeId || "",
      startTime: toInputValue(event.startTime),
      endTime: toInputValue(event.endTime),
      location: event.location || "",
      eventType: event.eventType || "event",
      status: event.status || "scheduled",
      visibleToAlumni: !!event.visibleToAlumni,
      chapterWide: event.eventType === "chapter" || !event.committeeId,
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
    setShowModal(true);
  }

  async function handleSaveEdit(scope?: "single" | "series") {
    if (!editId) return;
    const isRecurring =
      editEvent?.recurrence?.enabled || editEvent?.recurrenceParentId;
    if (!scope && isRecurring) {
      setShowSeriesPrompt(true);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/events/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        committeeId: form.eventType === "chapter" ? null : form.committeeId || null,
        recurrence: {
          enabled: form.recurrenceEnabled,
          frequency: form.recurrenceFrequency,
          interval: Number(form.recurrenceInterval) || 1,
          endDate: form.recurrenceEndDate || null,
          count: Number(form.recurrenceCount) || 1,
        },
        applyToSeries: scope === "series" ? "series" : "single",
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (scope === "series") {
        await reloadEvents();
      } else {
        setEvents((prev) =>
          prev.map((evt) =>
            evt._id === editId
              ? {
                  ...updated,
                  eventType: normalizeEventType(updated, form.eventType),
                }
              : evt
          )
        );
      }
      setEditId(null);
      setEditEvent(null);
      resetForm();
      setShowModal(false);
      setShowSeriesPrompt(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update event");
    }
    setSaving(false);
  }

  async function handleDeleteEvent(id: string) {
    const isAdmin = me?.role === "admin" || me?.role === "superadmin";
    if (!isAdmin) {
      const res = await fetch(`/api/events/${id}`);
      if (res.ok) {
        const event = await res.json();
        const hasAttendees =
          Array.isArray(event.attendees) && event.attendees.length > 0;
        if (event.status === "completed" && hasAttendees) {
          setDeleteError("Only admins can delete completed events with attendees.");
          return false;
        }
      }
    }
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((prev) => prev.filter((evt) => evt._id !== id));
      if (editId === id) setEditId(null);
      return true;
    }
    return false;
  }

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

  if (!canCreate) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>Only admins or E-Council can create chapter-wide events.</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard event-creator">
      <section className="bento-card admin-table-card">
        <div className="event-creator__header">
          <div>
            <h1 className="mb-2">Manage Events</h1>
            <p className="text-muted">
              Create, edit, and organize chapter or committee events.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditId(null);
              resetForm();
              setShowModal(true);
            }}
          >
            Create Event
          </button>
        </div>
        <div className="table-responsive">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Committee</th>
                <th>Type</th>
                <th>Start</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {managedEvents.map((evt) => {
                const committee = committees.find((c) => c._id === evt.committeeId);
                const eventTypeLabel = normalizeEventType(evt);
                return (
                  <tr key={evt._id}>
                    <td>{evt.name}</td>
                    <td>{committee?.name || "Unknown"}</td>
                    <td>{eventTypeLabel}</td>
                    <td>{new Date(evt.startTime).toLocaleString()}</td>
                    <td>{evt.status}</td>
                    <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-primary me-2"
                      onClick={() => startEdit(evt._id)}
                    >
                      Edit
                    </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(evt);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {managedEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered event-modal">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editId ? "Edit Event" : "Create Event"}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowModal(false);
                    setEditId(null);
                    resetForm();
                    setError(null);
                  }}
                />
              </div>
              <div className="modal-body">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editId) {
                      handleSaveEdit();
                    } else {
                      handleCreateEvent(e);
                    }
                  }}
                  className="row g-3"
                >
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
              <label className="form-label">Committee</label>
              <select
                className="form-select"
                value={form.committeeId}
                onChange={(e) => updateForm("committeeId", e.target.value)}
                disabled={
                  form.chapterWide ||
                  (!!editId &&
                    !(me?.role === "admin" || me?.role === "superadmin"))
                }
                required={!form.chapterWide}
              >
                <option value="">Select committee</option>
                {visibleCommittees.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Event Type</label>
              <select
                className="form-select"
                value={form.eventType}
                onChange={(e) => {
                  const value = e.target.value;
                  updateForm("eventType", value);
                  if (value === "chapter") {
                    updateForm("chapterWide", true);
                    updateForm("committeeId", "");
                  } else if (form.chapterWide) {
                    updateForm("chapterWide", false);
                  }
                }}
              >
                <option value="meeting">Meeting</option>
                <option value="event">Event</option>
                <option value="chapter">Chapter</option>
              </select>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input
                  id="chapterWide"
                  className="form-check-input"
                  type="checkbox"
                  checked={form.chapterWide}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateForm("chapterWide", checked);
                    if (checked) {
                      updateForm("eventType", "chapter");
                      updateForm("committeeId", "");
                    }
                  }}
                />
                <label htmlFor="chapterWide" className="form-check-label">
                  Chapter-wide event (no committee)
                </label>
              </div>
            </div>
            <div className="col-12">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={2}
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
            <div className="col-md-6">
              <label className="form-label">Location</label>
              <input
                className="form-control"
                value={form.location}
                onChange={(e) => updateForm("location", e.target.value)}
              />
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
              <div className="form-check">
                <input
                  id="visibleToAlumni"
                  className="form-check-input"
                  type="checkbox"
                  checked={form.visibleToAlumni}
                  onChange={(e) =>
                    updateForm("visibleToAlumni", e.target.checked)
                  }
                />
                <label htmlFor="visibleToAlumni" className="form-check-label">
                  Visible to alumni
                </label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input
                  id="recurrenceEnabled"
                  className="form-check-input"
                  type="checkbox"
                  checked={form.recurrenceEnabled}
                  onChange={(e) =>
                    updateForm("recurrenceEnabled", e.target.checked)
                  }
                />
                <label htmlFor="recurrenceEnabled" className="form-check-label">
                  Repeat this event
                </label>
              </div>
            </div>
            {form.recurrenceEnabled && (
              <>
                <div className="col-md-4">
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
                <div className="col-md-4">
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
                <div className="col-md-4">
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
                <div className="col-md-4">
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
                    Creates the next N occurrences now. More generate as events
                    complete.
                  </div>
                </div>
              </>
            )}
            {error && <div className="text-danger">{error}</div>}
            <div className="col-12">
              <div className="d-flex gap-2">
                <button className="btn btn-primary" disabled={saving} type="submit">
                  {saving && <LoadingSpinner size="sm" className="me-2" />}
                  {saving ? "Saving..." : editId ? "Save Changes" : "Create Event"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditId(null);
                    setEditEvent(null);
                    resetForm();
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Event</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }}
                />
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to delete{" "}
                  <strong>{deleteTarget.name}</strong>?
                </p>
                {deleteError && <div className="text-danger">{deleteError}</div>}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={async () => {
                    const deleted = await handleDeleteEvent(deleteTarget._id);
                    if (deleted) {
                      setDeleteTarget(null);
                      setDeleteError(null);
                    }
                  }}
                >
                  Delete
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
                  onClick={() => {
                    setShowSeriesPrompt(false);
                    handleSaveEdit("single");
                  }}
                >
                  Just this event
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setShowSeriesPrompt(false);
                    handleSaveEdit("series");
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
