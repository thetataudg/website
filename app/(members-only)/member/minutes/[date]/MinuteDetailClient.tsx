"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faFilePdf,
  faEdit,
  faTrash,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../../components/LoadingState";
import MinuteFormModal, {
  EventOption,
  MinuteFormValues,
} from "../components/MinuteFormModal.tsx";

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
  executiveSummary?: string;
  eventId?: string;
  eventName?: string;
};

const formatDate = (value: string, includeTime = false) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: includeTime ? "full" : "long",
    timeStyle: includeTime ? "short" : undefined,
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

const canManageMinutes = (member: MemberSummary | null) =>
  !!member &&
  (member.role === "admin" ||
    member.role === "superadmin" ||
    (member.isECouncil &&
      typeof member.ecouncilPosition === "string" &&
      member.ecouncilPosition.toLowerCase() === "scribe"));

export default function MinuteDetailClient({ date }: { date: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [minute, setMinute] = useState<MinuteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);

  const loadMinute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/minutes/${date}`);
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Minute not found");
      }
      const data = await response.json();
      setMinute(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load minutes");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (!isSignedIn) return;
    async function fetchProfile() {
      const res = await fetch("/api/members/me");
      if (!res.ok) {
        setMember(null);
        return;
      }
      const data = await res.json();
      setMember({
        role: data.role,
        isECouncil: data.isECouncil,
        ecouncilPosition: data.ecouncilPosition,
      });
    }
    fetchProfile();
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    loadMinute();
  }, [isSignedIn, loadMinute]);

  useEffect(() => {
    if (!canManageMinutes(member)) return;
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
  }, [member]);

  const handleDelete = async () => {
    if (!confirm("Delete these minutes permanently?")) return;
    setActionMessage("Deleting minutes…");
    try {
      const res = await fetch(`/api/minutes/${date}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/member/minutes");
    } catch (err: any) {
      setActionMessage(err?.message || "Delete failed");
    }
  };

  const handleHide = async () => {
    if (!minute) return;
    setActionMessage("Updating visibility…");
    try {
      const res = await fetch(`/api/minutes/${date}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !minute.hidden }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Update failed");
      }
      const updated = await res.json();
      setMinute(updated);
      setActionMessage(null);
    } catch (err: any) {
      setActionMessage(err?.message || "Update failed");
    }
  };

  const handleEditSubmit = async (values: MinuteFormValues) => {
    const form = new FormData();
    form.append("startTime", values.startTime);
    form.append("endTime", values.endTime);
    form.append("activesPresent", values.activesPresent);
    form.append("quorumRequired", String(values.quorumRequired));
    form.append("executiveSummary", values.executiveSummary);
    form.append("eventId", values.eventId ?? "");
    if (values.file) {
      form.append("minutesFile", values.file);
    }
    const res = await fetch(`/api/minutes/${date}`, {
      method: "PATCH",
      body: form,
    });
    if (!res.ok) {
      const payload = await res.json();
      throw new Error(payload.error || "Unable to update minutes");
    }
    const updated = await res.json();
    setMinute(updated);
    setShowEdit(false);
  };

  const initialFormValues = useMemo<MinuteFormValues | undefined>(() => {
    if (!minute) return undefined;
    const start = new Date(minute.startTime);
    const end = new Date(minute.endTime);
    const toLocal = (value: Date) => {
      const offset = value.getTimezoneOffset();
      const local = new Date(value.getTime() - offset * 60 * 1000);
      return local.toISOString().slice(0, 16);
    };
    return {
      startTime: toLocal(start),
      endTime: toLocal(end),
      activesPresent: String(minute.activesPresent),
      quorumRequired: minute.quorumRequired,
      executiveSummary: minute.executiveSummary ?? "",
      eventId: minute.eventId ?? "",
    };
  }, [minute]);

  if (!isLoaded) {
    return <LoadingState message="Loading..." />;
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

  if (loading) {
    return <LoadingState message="Loading minutes..." />;
  }

  if (error || !minute) {
    return (
      <div className="container">
        <div className="alert alert-danger mt-5">{error || "Minutes not found"}</div>
      </div>
    );
  }

  return (
    <div className="member-dashboard minutes-detail-page">
      <section className="bento-card">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <div className="hero-eyebrow">Minutes detail</div>
            <h1 className="hero-title">{formatDate(minute.meetingDate)}</h1>
            <p className="hero-subtitle">
              Duration {formatDuration(minute.startTime, minute.endTime)},{" "}
              {minute.activesPresent} actives present.
            </p>
            {minute.eventName && (
              <p className="minutes-detail__event">
                Linked to <strong>{minute.eventName}</strong>
              </p>
            )}
          </div>
          {canManageMinutes(member) && (
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setShowEdit(true)}
              >
                <FontAwesomeIcon icon={faEdit} /> Edit
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={handleHide}
              >
                <FontAwesomeIcon icon={faEyeSlash} />{" "}
                {minute.hidden ? "Unhide" : "Hide"}
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={handleDelete}
              >
                <FontAwesomeIcon icon={faTrash} /> Delete
              </button>
            </div>
          )}
        </div>

        <div className="minutes-detail__stats mt-4">
          <div>
            <p className="text-muted mb-1">Meeting start</p>
            <strong>{formatDate(minute.startTime, true)}</strong>
          </div>
          <div>
            <p className="text-muted mb-1">Meeting end</p>
            <strong>{formatDate(minute.endTime, true)}</strong>
          </div>
          <div>
            <p className="text-muted mb-1">Quorum</p>
            <strong>{minute.quorumRequired ? "Yes" : "No"}</strong>
          </div>
        </div>

        <div className="minutes-detail__summary mt-4">
          <h3 className="mb-2">Executive summary</h3>
          <p>{minute.executiveSummary}</p>
        </div>

        {minute.minutesUrl && (
          <div className="minutes-detail__pdf mt-4">
            <iframe
              title="Minutes PDF"
              src={minute.minutesUrl}
              loading="lazy"
            />
          </div>
        )}

        <div className="mt-3 d-flex gap-2">
          <a
            href={minute.minutesUrl}
            className="btn btn-outline-secondary"
            target="_blank"
            rel="noreferrer"
          >
            <FontAwesomeIcon icon={faFilePdf} /> Download minutes
          </a>
        </div>
        {actionMessage && (
          <p className="text-muted mt-2 mb-0">{actionMessage}</p>
        )}
      </section>

      {showEdit && initialFormValues && (
        <MinuteFormModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSubmit={handleEditSubmit}
          initialValues={initialFormValues}
          title="Edit minutes"
          submitLabel="Save changes"
          showFileInput
          events={events}
        />
      )}
    </div>
  );
}
