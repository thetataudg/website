"use client";

import React, { useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../../../components/LoadingState";

type Member = {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
};

export default function EventCheckInPage({ params }: { params: { id: string } }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<{ role: string; memberId: string } | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [committee, setCommittee] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [pendingCheckIn, setPendingCheckIn] = useState<Member | null>(null);
  const [endingEvent, setEndingEvent] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const zxingReaderRef = useRef<any>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanningRef = useRef(false);
  const processingRef = useRef(false);

  async function refreshEvent() {
    const eventRes = await fetch(`/api/events/${params.id}`);
    const eventData = eventRes.ok ? await eventRes.json() : null;
    setEvent(eventData);
    return eventData;
  }

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/members/me");
      const meData = meRes.ok ? await meRes.json() : null;
      setMe(meData);

      const eventData = await refreshEvent();

      if (eventData?.committeeId) {
        const commRes = await fetch(`/api/committees/${eventData.committeeId}`);
        const commData = commRes.ok ? await commRes.json() : null;
        setCommittee(commData);
      }

      const memRes = await fetch("/api/members");
      const memData = memRes.ok ? await memRes.json() : [];
      setMembers(memData.filter((m: Member) => m.status === "Active"));
      setLoading(false);
    }
    if (isSignedIn) init();
  }, [isSignedIn, params.id]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const isHead =
    committee?.committeeHeadId?.toString?.() === me?.memberId ||
    committee?.committeeHeadId?._id === me?.memberId;

  const mstDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const formatMstDateTime = (value: string | Date) =>
    mstDateTimeFormatter.format(new Date(value));

  async function checkInCode(code: string) {
    const payload: Record<string, any> = {
      code,
      source: "Phone",
    };
    if (me?.memberId) {
      payload.scannerMemberId = me.memberId;
    }
    const res = await fetch(`/api/events/${params.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    const errorMessage =
      data?.error === "Invalid code" ? "Invalid or expired code." : data?.error;
    if (res.ok) {
      setStatus(
        data.status === "already-checked-in"
          ? "Already checked in."
          : "Checked in successfully."
      );
      await refreshEvent();
    } else {
      setStatus(errorMessage || "Check-in failed.");
    }
  }

  async function manualCheckIn(memberId: string) {
    const payload: Record<string, any> = {
      memberId,
      source: "Phone",
    };
    if (me?.memberId) {
      payload.scannerMemberId = me.memberId;
    }
    const res = await fetch(`/api/events/${params.id}/manual-check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(
        data.status === "already-checked-in"
          ? "Already checked in."
          : "Checked in successfully."
      );
      await refreshEvent();
    } else {
      setStatus(data.error || "Manual check-in failed.");
    }
  }

  async function endEvent() {
    if (!event) return;
    setEndingEvent(true);
    try {
      const res = await fetch(`/api/events/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok) {
        await refreshEvent();
        setStatus("Event ended.");
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error || "Unable to end event.");
      }
    } catch {
      setStatus("Unable to end event.");
    } finally {
      setEndingEvent(false);
    }
  }

  async function startScanner() {
    if (!videoRef.current) return;
    setStatus("");
    stopScanner();
    if (!("BarcodeDetector" in window)) {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        zxingReaderRef.current = reader;
        scanningRef.current = true;
    zxingControlsRef.current = await reader.decodeFromVideoDevice(
      undefined,
      videoRef.current,
      async (result) => {
        if (!scanningRef.current || !result) return;
    const text =
      typeof result === "string" ? result : result.getText?.() || "";
        if (text && !processingRef.current) {
          processingRef.current = true;
          await checkInCode(text);
          setTimeout(() => {
            processingRef.current = false;
          }, 1500);
        }
          }
    );
    return;
  } catch (err) {
    setStatus("Unable to start scanner. Use manual check-in.");
    scanningRef.current = false;
    return;
  }
}

streamRef.current = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false,
});
    videoRef.current.srcObject = streamRef.current;
    await videoRef.current.play();

  detectorRef.current = new (window as any).BarcodeDetector({
    formats: ["qr_code"],
  });

  const canvas = document.createElement("canvas");
  scanCanvasRef.current = canvas;

  scanningRef.current = true;
  scanLoop();
}

function stopScanner() {
  scanningRef.current = false;
  if (zxingControlsRef.current) {
    zxingControlsRef.current.stop();
    zxingControlsRef.current = null;
  }
  if (zxingReaderRef.current?.reset) {
    zxingReaderRef.current.reset();
  }
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  scanCanvasRef.current = null;
}

  async function scanLoop() {
    if (!scanningRef.current || !videoRef.current || !detectorRef.current) return;
  try {
    const canvas = scanCanvasRef.current;
    let detectionTarget: CanvasImageSource | undefined = videoRef.current;
    if (canvas && videoRef.current) {
      const width =
        videoRef.current.videoWidth || videoRef.current.clientWidth || 0;
      const height =
        videoRef.current.videoHeight || videoRef.current.clientHeight || 0;

      if (width && height) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.filter = "contrast(180%) brightness(130%)";
          ctx.drawImage(videoRef.current, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          // Boost contrast further by thresholding to binary colors.
          for (let i = 0; i < data.length; i += 4) {
            const gray =
              data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const value = gray > 160 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
          }
          ctx.putImageData(imageData, 0, 0);
          detectionTarget = canvas;
        }
      } else {
        detectionTarget = videoRef.current;
      }
    }

    const codes = await detectorRef.current.detect(
      detectionTarget as CanvasImageSource
    );
    if (codes && codes.length > 0) {
      const code = codes[0].rawValue || "";
      if (code && !processingRef.current) {
        processingRef.current = true;
          await checkInCode(code);
          setTimeout(() => {
            processingRef.current = false;
          }, 1500);
        }
      }
    } catch {
      // ignore detection errors
    }
    if (scanningRef.current) {
      requestAnimationFrame(scanLoop);
    }
  }

  const [query, setQuery] = useState("");
  const matches = members.filter((m) => {
    const label = `${m.fName} ${m.lName} ${m.rollNo}`.toLowerCase();
    return query && label.includes(query.toLowerCase());
  });
  const memberMap = new Map(members.map((m) => [String(m._id), m]));

  if (!isLoaded || loading) {
    return <LoadingState message="Loading check-in tools..." />;
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

  if (!isAdmin && !isHead) {
    return (
      <div className="container">
        <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>Only committee heads or admins can check in attendees.</h3>
        </div>
      </div>
    );
  }

  if (event?.status && event.status !== "ongoing") {
    return (
      <div className="container">
        <div className="alert alert-warning d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>Check-in is only available while the event is ongoing.</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard checkin-page">
      <section className="bento-card checkin-hero">
        <div>
          <div className="hero-eyebrow">Event Tools</div>
          <h1 className="hero-title">Event Check-In</h1>
          <p className="hero-subtitle">
            {event?.name || "Check in attendees and track participation."}
          </p>
        </div>
        <div className="checkin-meta">
          <span className="checkin-meta__label">Location</span>
          <span>{event?.location || "TBD"}</span>
          <span className="checkin-meta__label">Start</span>
          <span>
            {event?.startTime ? formatMstDateTime(event.startTime) : "TBD"}
          </span>
          {event?.status === "ongoing" && (isAdmin || isHead) && (
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={endEvent}
              disabled={endingEvent}
            >
              {endingEvent ? "Ending..." : "End event"}
            </button>
          )}
        </div>
      </section>

      <div className="checkin-grid">
        <div className="bento-card checkin-card">
          <div className="checkin-card__header">
            <h4>Scan QR Code</h4>
          </div>
          <video ref={videoRef} className="checkin-video" playsInline />
          <div className="checkin-actions">
            <button className="btn btn-primary" onClick={startScanner}>
              Start Scanner
            </button>
            <button className="btn btn-outline-secondary" onClick={stopScanner}>
              Stop
            </button>
          </div>
          {status && <p className="checkin-status">{status}</p>}
        </div>

        <div className="bento-card checkin-card">
          <div className="checkin-card__header">
            <h4>Manual Check-In</h4>
          </div>
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
      </div>

      <section className="bento-card checkin-attendees">
        <div className="checkin-attendees__header">
          <div>
            <h4>Checked-In Attendees</h4>
            <p className="text-muted">
              Total checked in: {event?.attendees?.length || 0}
            </p>
          </div>
        </div>
        {event?.attendees?.length ? (
          <div className="table-responsive">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="text-end">Checked In At</th>
                </tr>
              </thead>
              <tbody>
                {event.attendees.map((entry: any) => {
                  const memberObj =
                    entry?.memberId &&
                    typeof entry.memberId === "object" &&
                    !Array.isArray(entry.memberId) &&
                    (entry.memberId.fName || entry.memberId.lName)
                      ? entry.memberId
                      : Array.isArray(entry?.memberId) && entry.memberId[0]
                      ? entry.memberId[0]
                      : null;
                  let key = "";
                  if (memberObj?._id) {
                    key = String(memberObj._id);
                  } else if (entry?.memberId && typeof entry.memberId === "object") {
                    if (Array.isArray(entry.memberId) && entry.memberId[0]?._id) {
                      key = String(entry.memberId[0]._id);
                    } else if (entry.memberId._id) {
                      key = String(entry.memberId._id);
                    } else if (typeof entry.memberId.toString === "function") {
                      key = String(entry.memberId.toString());
                    }
                  } else if (typeof entry?.memberId === "string") {
                    key = entry.memberId;
                  } else if (typeof entry === "string") {
                    key = entry;
                  }
                  const fallback = key ? memberMap.get(key) : null;
                  const fName = memberObj?.fName || fallback?.fName || "";
                  const lName = memberObj?.lName || fallback?.lName || "";
                  const rollNo = memberObj?.rollNo || fallback?.rollNo || "";
                  const hasName = fName || lName || rollNo;
                  return (
                    <tr key={key || entry.checkedInAt}>
                      <td>
                        {hasName
                          ? `${fName} ${lName} ${rollNo ? `(#${rollNo})` : ""}`
                          : key
                          ? `Member ${key}`
                          : "Unknown member"}
                      </td>
                      <td className="text-end text-muted">
                        {entry?.checkedInAt
                          ? formatMstDateTime(entry.checkedInAt)
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No one checked in yet.</p>
        )}
      </section>

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
                  Check in {pendingCheckIn.fName} {pendingCheckIn.lName} (#
                  {pendingCheckIn.rollNo})?
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
                    await manualCheckIn(pendingCheckIn._id);
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
