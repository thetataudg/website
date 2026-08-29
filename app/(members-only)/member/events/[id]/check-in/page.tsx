"use client";

import React, { useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { QrCode, Search, TriangleAlert, Undo2, X } from "lucide-react";

import LoadingState from "../../../../components/LoadingState";
import {
  PageContainer,
  PageHeader,
} from "../../../../components/shell/PageShell";
import { EmptyState } from "../../../../components/shell/States";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeCheckInSource } from "@/lib/checkinSource";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  // The row that can still be taken back: whoever went on the list last.
  // Faster than a confirm on every check-in, and it is the wrong ones that
  // are rare — not the right ones. Undo is offered on the person's own row
  // rather than in a banner, so it is next to the name it would remove.
  const [undoableId, setUndoableId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
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
      const already = data.status === "already-checked-in";
      setStatus(already ? "Already checked in." : "Checked in successfully.");
      if (!already && data.memberId) setUndoableId(String(data.memberId));
      await refreshEvent();
    } else {
      setStatus(errorMessage || "Check-in failed.");
    }
  }

  async function manualCheckIn(member: Member) {
    const res = await fetch(`/api/events/${params.id}/manual-check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member._id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const already = data.status === "already-checked-in";
      setStatus(
        already
          ? `${member.fName} ${member.lName} was already checked in.`
          : `${member.fName} ${member.lName} checked in.`
      );
      setUndoableId(already ? null : member._id);
      setQuery("");
      await refreshEvent();
    } else {
      setUndoableId(null);
      setStatus(data.error || "Manual check-in failed.");
    }
  }

  async function undoCheckIn(memberId: string, name: string) {
    setUndoing(true);
    try {
      const res = await fetch(`/api/events/${params.id}/manual-check-in`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        setStatus(`${name} taken back off.`);
        setUndoableId(null);
        await refreshEvent();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error || "Unable to undo that check-in.");
      }
    } finally {
      setUndoing(false);
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
      <PageContainer className="max-w-2xl">
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            You must be logged in to use this function.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (!isAdmin && !isHead) {
    return (
      <PageContainer className="max-w-2xl">
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Only committee heads or admins can check in attendees.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (event?.status && event.status !== "ongoing") {
    return (
      <PageContainer className="max-w-2xl">
        <Alert variant="warning" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Check-in is only available while the event is ongoing.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow={
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event Tools
          </p>
        }
        title="Event Check-In"
        description={
          event?.name || "Check in attendees and track participation."
        }
        actions={
          event?.status === "ongoing" && (isAdmin || isHead) ? (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={endEvent}
              disabled={endingEvent}
            >
              {endingEvent ? "Ending…" : "End event"}
            </Button>
          ) : null
        }
      />

      <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </dt>
          <dd className="m-0 text-sm text-foreground">
            {event?.location || "TBD"}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Start
          </dt>
          <dd className="m-0 text-sm text-foreground">
            {event?.startTime ? formatMstDateTime(event.startTime) : "TBD"}
          </dd>
        </div>
      </dl>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode aria-hidden="true" className="size-4" />
              Scan QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <video
              ref={videoRef}
              playsInline
              className="aspect-video w-full rounded-lg border border-border bg-muted object-cover"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={startScanner}>Start Scanner</Button>
              <Button variant="outline" onClick={stopScanner}>
                Stop
              </Button>
            </div>
            <p aria-live="polite" className="m-0 text-sm text-muted-foreground empty:hidden">
              {status}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Icon, field, and clear button as flex siblings so the icon can
              * never overlap the text — the house pattern for icon-in-field. */}
            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Search
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a name or roll number"
                aria-label="Search members to check in"
                className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {matches.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {matches.slice(0, 8).map((m) => (
                  <li key={m._id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => {
                        void manualCheckIn(m);
                      }}
                    >
                      {m.fName} {m.lName} (#{m.rollNo})
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checked-In Attendees</CardTitle>
          <p className="m-0 text-sm text-muted-foreground">
            Total checked in: {event?.attendees?.length || 0}
          </p>
        </CardHeader>
        <CardContent>
          {event?.attendees?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col">How</TableHead>
                    <TableHead scope="col" className="text-right">
                      Checked In At
                    </TableHead>
                    <TableHead scope="col" className="w-px">
                      <span className="sr-only">Undo</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                    <TableRow key={key || entry.checkedInAt}>
                      <TableCell>
                        {hasName
                          ? `${fName} ${lName} ${rollNo ? `(#${rollNo})` : ""}`
                          : key
                          ? `Member ${key}`
                          : "Unknown member"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {describeCheckInSource(entry)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {entry?.checkedInAt
                          ? formatMstDateTime(entry.checkedInAt)
                          : ""}
                      </TableCell>
                      <TableCell className="py-1 pl-2 text-right">
                        {key && key === undoableId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={undoing}
                            onClick={() =>
                              void undoCheckIn(
                                key,
                                `${fName} ${lName}`.trim() || "That member"
                              )
                            }
                          >
                            <Undo2 aria-hidden="true" className="size-4" />
                            Undo
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              title="No one checked in yet"
              description="Attendees appear here as they scan in or are added manually."
            />
          )}
        </CardContent>
      </Card>

    </PageContainer>
  );
}
