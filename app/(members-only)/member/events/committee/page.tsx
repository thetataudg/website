"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

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
  const [me, setMe] = useState<{ role: string; memberId: string; isECouncil: boolean } | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingCheckIn, setPendingCheckIn] = useState<Member | null>(null);

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/members/me");
      const meData = meRes.ok ? await meRes.json() : null;
      setMe(meData);

      const commRes = await fetch("/api/committees");
      const commData = commRes.ok ? await commRes.json() : [];
      setCommittees(commData);

      const evRes = await fetch("/api/events?includePast=true");
      const evData = evRes.ok ? await evRes.json() : [];
      setEvents(evData);

      const memRes = await fetch("/api/members");
      const memData = memRes.ok ? await memRes.json() : [];
      setMembers(memData.filter((m: Member) => m.status === "Active"));

      setLoading(false);
    }
    if (isSignedIn) init();
  }, [isSignedIn]);

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

  const managedEvents = events.filter((e) =>
    managedCommitteeIds.includes(e.committeeId)
  );

  const selectedCommitteeEvents = selectedCommitteeId
    ? managedEvents.filter((e) => e.committeeId === selectedCommitteeId)
    : [];

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

  if (!isLoaded || loading) {
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
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

  return (
    <div className="container-xxl mt-4">
      <h1 className="mb-4">Committee Events</h1>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card">
            <div className="card-body">
              <h4>Your Committees</h4>
              <div className="mb-3">
                <label className="form-label">Select committee</label>
                <select
                  className="form-select"
                  value={selectedCommitteeId}
                  onChange={(e) => {
                    setSelectedCommitteeId(e.target.value);
                    setSelectedEvent(null);
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

              <h5>Committee Events</h5>
              {selectedCommitteeEvents.length ? (
                <ul className="list-group">
                  {selectedCommitteeEvents.map((evt) => (
                    <li
                      key={evt._id}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <div className="fw-semibold">{evt.name}</div>
                        <small className="text-muted">
                          {new Date(evt.startTime).toLocaleDateString()} •{" "}
                          {evt.status}
                        </small>
                      </div>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => loadEventDetails(evt._id)}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No events for this committee yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card">
            <div className="card-body">
              <h4>Event Summary</h4>
              {selectedCommitteeId && (
                <CreateCommitteeEvent
                  committeeId={selectedCommitteeId}
                  onCreated={async () => {
                    const evRes = await fetch("/api/events?includePast=true");
                    const evData = evRes.ok ? await evRes.json() : [];
                    setEvents(evData);
                  }}
                />
              )}
              {selectedEvent ? (
                <>
                  <h6 className="mb-2">{selectedEvent.name}</h6>
                  <p className="text-muted">
                    Total checked in: {selectedEvent.attendees?.length || 0}
                  </p>

                  <div className="mb-3">
                    <label className="form-label">Add attendee</label>
                    <input
                      className="form-control"
                      placeholder="Type a name or roll number"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {matches.length > 0 && (
                      <div className="list-group mt-2">
                        {matches.slice(0, 8).map((m) => (
                          <button
                            type="button"
                            key={m._id}
                            className="list-group-item list-group-item-action"
                            onClick={() => {
                              setPendingCheckIn(m);
                            }}
                          >
                            {m.fName} {m.lName} (#{m.rollNo})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedEvent.attendees?.length ? (
                    <ul className="list-group">
                      {selectedEvent.attendees.map((entry: any) => (
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
                </>
              ) : (
                <p className="text-muted">Select an event to view details.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingCheckIn && (
        <div
          className="modal fade show"
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
    </div>
  );
}

function CreateCommitteeEvent({
  committeeId,
  onCreated,
}: {
  committeeId: string;
  onCreated: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    gemPointDurationMinutes: "0",
    visibleToAlumni: true,
  });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        committeeId,
        gemPointDurationMinutes: Number(form.gemPointDurationMinutes) || 0,
      }),
    });
    setSaving(false);
    setForm({
      name: "",
      description: "",
      startTime: "",
      endTime: "",
      location: "",
      gemPointDurationMinutes: "0",
      visibleToAlumni: true,
    });
    await onCreated();
  }

  return (
    <form onSubmit={submit} className="mb-4">
      <h5>Create Event for Committee</h5>
      <div className="row g-2">
        <div className="col-md-6">
          <input
            className="form-control"
            placeholder="Event name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </div>
        <div className="col-md-6">
          <input
            className="form-control"
            placeholder="Location"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </div>
        <div className="col-12">
          <textarea
            className="form-control"
            rows={2}
            placeholder="Description"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>
        <div className="col-md-6">
          <input
            type="datetime-local"
            className="form-control"
            value={form.startTime}
            onChange={(e) => update("startTime", e.target.value)}
            required
          />
        </div>
        <div className="col-md-6">
          <input
            type="datetime-local"
            className="form-control"
            value={form.endTime}
            onChange={(e) => update("endTime", e.target.value)}
            required
          />
        </div>
        <div className="col-md-4">
          <input
            type="number"
            className="form-control"
            min={0}
            value={form.gemPointDurationMinutes}
            onChange={(e) => update("gemPointDurationMinutes", e.target.value)}
          />
        </div>
        <div className="col-md-8 d-flex align-items-center">
          <div className="form-check">
            <input
              id="visibleToAlumniCommittee"
              className="form-check-input"
              type="checkbox"
              checked={form.visibleToAlumni}
              onChange={(e) => update("visibleToAlumni", e.target.checked)}
            />
            <label
              htmlFor="visibleToAlumniCommittee"
              className="form-check-label"
            >
              Visible to alumni
            </label>
          </div>
        </div>
        <div className="col-12">
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </form>
  );
}
