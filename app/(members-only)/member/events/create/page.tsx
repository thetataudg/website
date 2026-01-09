"use client";

import React, { useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

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
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    committeeId: "",
    startTime: "",
    endTime: "",
    location: "",
    gemPointDurationMinutes: "0",
    status: "scheduled",
    visibleToAlumni: true,
    chapterWide: false,
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
    async function loadEvents() {
      const res = await fetch("/api/events?includePast=true");
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data);
    }
    if (me) {
      Promise.all([loadCommittees(), loadEvents()]).finally(() =>
        setLoading(false)
      );
    }
  }, [me]);

  const updateForm = <K extends keyof typeof form>(key: K, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        committeeId: form.chapterWide ? null : form.committeeId,
        gemPointDurationMinutes: Number(form.gemPointDurationMinutes) || 0,
      }),
    });

    if (res.ok) {
      const created = await res.json();
      setEvents((prev) => [created, ...prev]);
      setForm({
        name: "",
        description: "",
        committeeId: "",
        startTime: "",
        endTime: "",
        location: "",
        gemPointDurationMinutes: "0",
        status: "scheduled",
        visibleToAlumni: true,
        chapterWide: false,
      });
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

  async function startEdit(event: any) {
    setEditId(event._id);
    setForm({
      name: event.name || "",
      description: event.description || "",
      committeeId: event.committeeId,
      startTime: toInputValue(event.startTime),
      endTime: toInputValue(event.endTime),
      location: event.location || "",
      gemPointDurationMinutes: String(event.gemPointDurationMinutes || 0),
      status: event.status || "scheduled",
      visibleToAlumni: !!event.visibleToAlumni,
    });
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/events/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        gemPointDurationMinutes: Number(form.gemPointDurationMinutes) || 0,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvents((prev) =>
        prev.map((evt) => (evt._id === editId ? updated : evt))
      );
      setEditId(null);
      setForm({
        name: "",
        description: "",
        committeeId: "",
        startTime: "",
        endTime: "",
        location: "",
        gemPointDurationMinutes: "0",
        status: "scheduled",
        visibleToAlumni: true,
      });
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update event");
    }
    setSaving(false);
  }

  async function handleDeleteEvent(id: string) {
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((prev) => prev.filter((evt) => evt._id !== id));
      if (editId === id) setEditId(null);
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
    <div className="container-xxl mt-4">
      <div className="card">
        <div className="card-body">
          <h1 className="mb-4">Event Creator</h1>
          <form
            onSubmit={editId ? (e) => e.preventDefault() : handleCreateEvent}
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
                required
              >
                <option value="">Select committee</option>
                {visibleCommittees.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
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
                  onChange={(e) => updateForm("chapterWide", e.target.checked)}
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
            <div className="col-md-3">
              <label className="form-label">Gem Point Minutes</label>
              <input
                type="number"
                className="form-control"
                min={0}
                value={form.gemPointDurationMinutes}
                onChange={(e) =>
                  updateForm("gemPointDurationMinutes", e.target.value)
                }
              />
            </div>
            <div className="col-md-3">
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
            {error && <div className="text-danger">{error}</div>}
            <div className="col-12">
              {editId ? (
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={handleSaveEdit}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Creating..." : "Create Event"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-body">
          <h4 className="card-title">Manage Events</h4>
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Name</th>
                <th>Committee</th>
                <th>Start</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {managedEvents.map((evt) => {
                const committee = committees.find(
                  (c) => c._id === evt.committeeId
                );
                return (
                  <tr key={evt._id}>
                    <td>{evt.name}</td>
                    <td>{committee?.name || "Unknown"}</td>
                    <td>{new Date(evt.startTime).toLocaleString()}</td>
                    <td>{evt.status}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => startEdit(evt)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setDeleteTarget(evt)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {managedEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  onClick={() => setDeleteTarget(null)}
                />
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to delete{" "}
                  <strong>{deleteTarget.name}</strong>?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={async () => {
                    await handleDeleteEvent(deleteTarget._id);
                    setDeleteTarget(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
