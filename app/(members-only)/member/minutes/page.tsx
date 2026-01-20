"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faFilePdf,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../components/LoadingState";
import MinuteFormModal, {
  EventOption,
  MinuteFormValues,
} from "./components/MinuteFormModal.tsx";

type MemberSummary = {
  role: string;
  isECouncil: boolean;
  ecouncilPosition?: string;
};

type MinuteRecord = {
  _id: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  activesPresent: number;
  quorumRequired: boolean;
  minutesUrl: string;
  hidden?: boolean;
  meetingDateKey?: string;
  executiveSummary?: string;
  eventId?: string;
  eventName?: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/Phoenix",
  }).format(new Date(value));

const formatDuration = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return "0 min";
  const minutes = Math.round(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hrLabel = hours ? `${hours}h` : "";
  const minLabel = remainder ? `${remainder}m` : "";
  return [hrLabel, minLabel].filter(Boolean).join(" ") || "0 min";
};

export default function MinutesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<MemberSummary | null>(null);
  const [minutes, setMinutes] = useState<MinuteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  const canManageMinutes =
    !!me &&
    (me.role === "admin" ||
      me.role === "superadmin" ||
      (me.isECouncil &&
        typeof me.ecouncilPosition === "string" &&
        me.ecouncilPosition.toLowerCase() === "scribe"));

  useEffect(() => {
    if (!isSignedIn) return;
    async function fetchProfile() {
      const res = await fetch("/api/members/me");
      if (!res.ok) {
        setMe(null);
        return;
      }
      const data = await res.json();
      setMe({
        role: data.role,
        isECouncil: data.isECouncil,
        ecouncilPosition: data.ecouncilPosition,
      });
    }
    fetchProfile();
  }, [isSignedIn]);

  useEffect(() => {
    if (!canManageMinutes) return;
    fetch("/api/events?includePast=true")
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load events");
        return res.json();
      })
      .then((data: any[]) => {
        const options = data.map((event) => ({
          _id: event._id,
          name: event.name,
          startTime: event.startTime,
        }));
        setEvents(options);
      })
      .catch(() => {
        setEvents([]);
      });
  }, [canManageMinutes]);

  useEffect(() => {
    if (!isSignedIn) return;
    if (!me && isLoaded) return;
    setLoading(true);
    const params = canManageMinutes ? "?includeHidden=true" : "";
    fetch(`/api/minutes${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load minutes");
        return res.json();
      })
      .then((data: MinuteRecord[]) => {
        setMinutes(data);
      })
      .catch(() => {
        setMinutes([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isSignedIn, me, canManageMinutes, isLoaded]);

  const openModal = () => {
    setFormError(null);
    setModalOpen(true);
  };

  const handleCreate = async (values: MinuteFormValues) => {
    setSubmitting(true);
    setFormError(null);
    const form = new FormData();
    form.append("startTime", values.startTime);
    form.append("endTime", values.endTime);
    form.append("activesPresent", values.activesPresent);
    form.append("quorumRequired", String(values.quorumRequired));
    form.append("executiveSummary", values.executiveSummary);
    if (values.eventId) {
      form.append("eventId", values.eventId);
    }
    if (values.file) {
      form.append("minutesFile", values.file);
    }

    try {
      const res = await fetch("/api/minutes", {
        method: "POST",
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save minutes");
      }
      setModalOpen(false);
      setSubmitting(false);
      setMinutes((prev) => [payload, ...prev]);
    } catch (err: any) {
      setFormError(err?.message || "Failed to submit minutes");
      setSubmitting(false);
      throw err;
    }
  };

  const filteredMinutes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return minutes;
    return minutes.filter((minute) => {
      const target = `${minute.executiveSummary ?? ""} ${
        minute.eventName ?? ""
      } ${minute.meetingDate}`;
      return target.toLowerCase().includes(term);
    });
  }, [minutes, searchTerm]);

  if (!isLoaded) {
    return <LoadingState message="Loading minutes…" />;
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faCalendar} className="h2" />
          <h3>You must be logged into use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard minutes-page">
      <section className="bento-card events-hero">
        <div>
          <div className="hero-eyebrow">
            <FontAwesomeIcon icon={faCalendar} className="me-2" />
            Chapter records
          </div>
          <h1 className="hero-title">Meeting Minutes</h1>
        </div>
        {canManageMinutes && (
          <div>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2"
              onClick={openModal}
            >
              <FontAwesomeIcon icon={faPlus} />
              New minutes
            </button>
          </div>
        )}
      </section>

      <section className="bento-card minutes-search">
        <div className="minutes-search__inner">
          <span className="minutes-search__label">Search minutes</span>
          <input
            type="search"
            className="form-control minutes-search__input"
            placeholder="Search by summary, event, or date"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </section>

      {loading ? (
        <LoadingState message="Loading minutes..." />
      ) : minutes.length ? (
        filteredMinutes.length ? (
          <section className="bento-card minutes-grid">
            {filteredMinutes.map((minute) => {
              const slug =
                minute.meetingDateKey || minute.meetingDate.split("T")[0];
              return (
                <Link
                  key={minute._id}
                  href={`/member/minutes/${slug}`}
                  className={`card-minute ${minute.hidden ? "card-minute--hidden" : ""}`}
                >
                  <div className="card-minute__head">
                    <div>
                      <p className="card-minute__label">Meeting date</p>
                      <strong>{formatDate(minute.meetingDate)}</strong>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <FontAwesomeIcon icon={faFilePdf} />
                      {minute.hidden && (
                        <span className="badge bg-secondary rounded-pill">
                          Hidden
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="card-minute__meta">
                    <span className="card-minute__meta-item">
                      Duration {formatDuration(minute.startTime, minute.endTime)}
                    </span>
                    <span className="card-minute__meta-item">
                      {`Actives: ${minute.activesPresent}`}
                    </span>
                    <span className="card-minute__meta-item">
                      {`Quorum: ${minute.quorumRequired ? "Yes" : "No"}`}
                    </span>
                  </div>
                  {minute.eventName && (
                    <p className="card-minute__event">
                      Linked to {minute.eventName}
                    </p>
                  )}
                  {minute.executiveSummary && (
                    <p className="card-minute__summary">
                      {minute.executiveSummary}
                    </p>
                  )}
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="bento-card">
            <p className="text-muted mb-0">
              No minutes match that search.
            </p>
          </section>
        )
      ) : (
        <section className="bento-card">
          <p className="text-muted mb-0">
            No minutes published yet. {canManageMinutes ? "Create one to get started." : ""}
          </p>
        </section>
      )}

      <MinuteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        title="Record new minutes"
        submitLabel="Save minutes"
        showFileInput
        disabled={submitting}
        events={events}
      />
      {formError && (
        <div className="text-danger text-center mt-3">{formError}</div>
      )}
    </div>
  );
}
