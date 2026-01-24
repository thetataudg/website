"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";
import { GEM_CATEGORIES, GEM_CATEGORY_LABELS, GemCategory } from "@/lib/gem";
import { toArizonaInputValue, toArizonaIso } from "@/lib/recurrence";

const STATUS_OPTIONS = [
  { value: "active", label: "Active (scheduled / ongoing)" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Event" },
  { value: "chapter", label: "Chapter" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All GEM categories" },
  ...GEM_CATEGORIES.map((value) => ({
    value,
    label: GEM_CATEGORY_LABELS[value],
  })),
  { value: "uncategorized", label: "Uncategorized" },
];

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
  const [summaryEvent, setSummaryEvent] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [committeeFilter, setCommitteeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [nameFilter, setNameFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const EVENTS_PER_PAGE = 15;

  const mstDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const formatMstDateTime = (value: string | Date) =>
    mstDateTimeFormatter.format(new Date(value));

  const [form, setForm] = useState({
    name: "",
    description: "",
    committeeId: "",
    startTime: "",
    endTime: "",
    location: "",
    gemCategory: "",
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
      gemCategory: "",
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

  const capitalizeLabel = (value: string) =>
    value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        startTime: toArizonaIso(form.startTime),
        endTime: toArizonaIso(form.endTime),
        committeeId: form.chapterWide ? null : form.committeeId || null,
        gemCategory: form.gemCategory || null,
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

  const resolvedStatusList = (filter: string) =>
    filter === "active" ? ["scheduled", "ongoing"] : [filter];

  const filteredEvents = useMemo(() => {
    if (!managedEvents.length) return [];
    return managedEvents.filter((evt) => {
      const statuses = resolvedStatusList(statusFilter);
      if (!statuses.includes(evt.status)) {
        return false;
      }
      const normalizedType = normalizeEventType(evt);
      if (typeFilter !== "all" && normalizedType !== typeFilter) {
        return false;
      }
      if (committeeFilter !== "all") {
        if (committeeFilter === "chapter") {
          if (normalizedType !== "chapter") return false;
        } else if (evt.committeeId !== committeeFilter) {
          return false;
        }
      }
      const eventCategory = evt.gemCategory || "uncategorized";
      if (categoryFilter !== "all" && eventCategory !== categoryFilter) {
        return false;
      }
      if (nameFilter.trim()) {
        if (!evt.name?.toLowerCase().includes(nameFilter.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [
    managedEvents,
    statusFilter,
    typeFilter,
    committeeFilter,
    categoryFilter,
    nameFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    typeFilter,
    committeeFilter,
    categoryFilter,
    nameFilter,
    managedEvents.length,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / EVENTS_PER_PAGE)
  );
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * EVENTS_PER_PAGE,
    currentPage * EVENTS_PER_PAGE
  );

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
      startTime: toArizonaInputValue(event.startTime),
      endTime: toArizonaInputValue(event.endTime),
      location: event.location || "",
      gemCategory: event.gemCategory || "",
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

  async function viewAttendance(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSummaryEvent(data);
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
        startTime: toArizonaIso(form.startTime),
        endTime: toArizonaIso(form.endTime),
        committeeId: form.eventType === "chapter" ? null : form.committeeId || null,
        gemCategory: form.gemCategory || null,
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
        <hr className="my-4" />
        <div className="event-filter-row row g-3 align-items-end">
          <div className="col-md-3 col-sm-6">
            <label className="form-label small text-muted">Status</label>
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3 col-sm-6">
            <label className="form-label small text-muted">Type</label>
            <select
              className="form-select form-select-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4 col-sm-6">
            <label className="form-label small text-muted">Committee</label>
            <select
              className="form-select form-select-sm"
              value={committeeFilter}
              onChange={(e) => setCommitteeFilter(e.target.value)}
            >
              <option value="all">All committees</option>
              <option value="chapter">Chapter-wide</option>
              {committees.map((committee) => (
                <option key={committee._id} value={committee._id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3 col-sm-6">
            <label className="form-label small text-muted">GEM category</label>
            <select
              className="form-select form-select-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-sm-6">
            <label className="form-label small text-muted">Event name</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="bento-card admin-table-card mt-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <p className="text-muted small mb-0">
              Showing {filteredEvents.length} events matching filters
            </p>
          </div>
          <div className="text-muted small">
            Page {currentPage} of {totalPages}
          </div>
        </div>
        <div className="table-responsive">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Committee</th>
                <th>Type</th>
                <th>Category</th>
                <th>Start</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.map((evt) => {
                const committee = committees.find((c) => c._id === evt.committeeId);
                const eventTypeLabel = normalizeEventType(evt);
                const displayEventType = capitalizeLabel(eventTypeLabel);
                const categoryLabel =
                  evt.gemCategory && GEM_CATEGORY_LABELS[evt.gemCategory as GemCategory]
                    ? GEM_CATEGORY_LABELS[evt.gemCategory as GemCategory]
                    : "Uncategorized";
                const committeeDisplay =
                  committee?.name ||
                  (eventTypeLabel === "chapter" ? "Chapter" : "Unknown");
                return (
                  <tr key={evt._id}>
                    <td>{evt.name}</td>
                    <td>{committeeDisplay}</td>
                    <td>{displayEventType}</td>
                    <td>{categoryLabel}</td>
                    <td>{formatMstDateTime(evt.startTime)}</td>
                    <td>{evt.status}</td>
                    <td className="text-end">
                      {evt.status === "completed" && (
                        <button
                          className="btn btn-sm btn-outline-secondary me-2"
                          onClick={() => viewAttendance(evt._id)}
                        >
                          View
                        </button>
                      )}
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
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted">
                    No events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-3">
          <span className="text-muted small">
            Showing{" "}
            {filteredEvents.length
              ? `${(currentPage - 1) * EVENTS_PER_PAGE + 1} - ${Math.min(
                  filteredEvents.length,
                  currentPage * EVENTS_PER_PAGE
                )}`
              : "0"}{" "}
            of {filteredEvents.length} events
          </span>
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
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
            <div className="col-md-6">
              <label className="form-label">GEM Category</label>
              <select
                className="form-select"
                value={form.gemCategory}
                onChange={(e) => updateForm("gemCategory", e.target.value)}
              >
                <option value="">Uncategorized</option>
                {GEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {GEM_CATEGORY_LABELS[category]}
                  </option>
                ))}
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
                            ? formatMstDateTime(entry.checkedInAt)
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
