"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { ErrorState, LoadingState } from "../../../components/shell/States";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import MinuteFormModal, {
  EventOption,
  MinuteFormValues,
} from "../components/MinuteFormModal";

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
      setMinute(await response.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load minutes");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (!isSignedIn) return;

    async function fetchProfile() {
      const response = await fetch("/api/members/me");
      if (!response.ok) {
        setMember(null);
        return;
      }
      const data = await response.json();
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
    Promise.all([
      fetch("/api/events?includePast=true"),
      fetch("/api/committees"),
    ])
      .then(async ([eventsResponse, committeesResponse]) => {
        if (!eventsResponse.ok || !committeesResponse.ok) {
          throw new Error("Unable to load events");
        }
        return Promise.all([eventsResponse.json(), committeesResponse.json()]);
      })
      .then(([eventData, committeeData]: [any[], any[]]) => {
        const committeeNames = new Map(
          committeeData.map((committee) => [String(committee._id), committee.name])
        );
        setEvents(
          eventData.map((event) => ({
            _id: event._id,
            name: event.name,
            startTime: event.startTime,
            committeeName: event.committeeId
              ? committeeNames.get(String(event.committeeId))
              : "Chapter-wide",
          }))
        );
      })
      .catch(() => setEvents([]));
  }, [member]);

  const handleDelete = async () => {
    setActionMessage("Deleting minutes…");
    try {
      const response = await fetch(`/api/minutes/${date}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      router.push("/member/minutes");
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleHide = async () => {
    if (!minute) return;
    setActionMessage("Updating visibility…");
    try {
      const response = await fetch(`/api/minutes/${date}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !minute.hidden }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Update failed");
      }
      setMinute(await response.json());
      setActionMessage(null);
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Update failed");
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
    if (values.file) form.append("minutesFile", values.file);

    const response = await fetch(`/api/minutes/${date}`, {
      method: "PATCH",
      body: form,
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "Unable to update minutes");
    }
    setMinute(await response.json());
    setShowEdit(false);
  };

  const initialFormValues = useMemo<MinuteFormValues | undefined>(() => {
    if (!minute) return undefined;
    const toLocal = (value: Date) => {
      const offset = value.getTimezoneOffset();
      const local = new Date(value.getTime() - offset * 60 * 1000);
      return local.toISOString().slice(0, 16);
    };
    return {
      startTime: toLocal(new Date(minute.startTime)),
      endTime: toLocal(new Date(minute.endTime)),
      activesPresent: String(minute.activesPresent),
      quorumRequired: minute.quorumRequired,
      executiveSummary: minute.executiveSummary ?? "",
      eventId: minute.eventId ?? "",
    };
  }, [minute]);

  if (!isLoaded) {
    return (
      <PageContainer>
        <LoadingState rows={4} label="Loading minutes…" />
      </PageContainer>
    );
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <ErrorState
          title="Sign in required"
          description="You must be signed in to view chapter minutes."
        />
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <LoadingState rows={4} label="Loading minutes…" />
      </PageContainer>
    );
  }

  if (error || !minute) {
    return (
      <PageContainer>
        <ErrorState
          title="Minutes not found"
          description={error || "This meeting record is unavailable."}
          action={
            <Button variant="outline" onClick={loadMinute}>
              Try again
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const mayManage = canManageMinutes(member);
  const summaryParagraphs = (minute.executiveSummary ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <PageContainer className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow={
          <Button variant="ghost" size="sm" className="-ml-3" asChild>
            <Link href="/member/minutes">
              <ArrowLeft aria-hidden="true" />
              All minutes
            </Link>
          </Button>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(minute.meetingDate)}
            {minute.hidden ? <Badge variant="warning">Hidden</Badge> : null}
          </span>
        }
        description={`${formatDuration(minute.startTime, minute.endTime)} · ${minute.activesPresent} actives present${minute.eventName ? ` · ${minute.eventName}` : ""}`}
        actions={
          mayManage ? (
            <>
              <Button variant="outline" onClick={() => setShowEdit(true)}>
                <Pencil aria-hidden="true" /> Edit
              </Button>
              <Button variant="outline" onClick={handleHide}>
                {minute.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                {minute.hidden ? "Unhide" : "Hide"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 aria-hidden="true" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete these minutes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the meeting record and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null
        }
      />

      {actionMessage ? (
        <Alert>
          <AlertDescription>{actionMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <article className="typeset typeset-article max-w-[37em]">
                <h2>Executive summary</h2>
                {summaryParagraphs.length ? (
                  summaryParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 32)}-${index}`}>{paragraph}</p>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No executive summary was recorded for this meeting.
                  </p>
                )}
              </article>
            </CardContent>
          </Card>

          <Card data-not-typeset>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
                  Official minutes
                </CardTitle>
                <CardDescription>
                  View the signed PDF record or open it in a new tab.
                </CardDescription>
              </div>
              {minute.minutesUrl ? (
                <Button variant="outline" asChild>
                  <a href={minute.minutesUrl} target="_blank" rel="noreferrer">
                    <Download aria-hidden="true" /> Download PDF
                  </a>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {minute.minutesUrl ? (
                <iframe
                  title={`Minutes for ${formatDate(minute.meetingDate)}`}
                  src={minute.minutesUrl}
                  loading="lazy"
                  className="h-[70vh] min-h-[32rem] w-full rounded-md border border-border bg-background"
                />
              ) : (
                <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  No PDF is attached to this meeting record.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meeting details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              <div className="space-y-1 pb-4">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4" aria-hidden="true" /> Started
                </dt>
                <dd className="font-medium text-foreground">
                  {formatDate(minute.startTime, true)}
                </dd>
              </div>
              <div className="space-y-1 py-4">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="size-4" aria-hidden="true" /> Ended
                </dt>
                <dd className="font-medium text-foreground">
                  {formatDate(minute.endTime, true)}
                </dd>
              </div>
              <div className="space-y-1 py-4">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-4" aria-hidden="true" /> Attendance
                </dt>
                <dd className="font-medium text-foreground">
                  {minute.activesPresent} active members
                </dd>
              </div>
              <div className="space-y-2 pt-4">
                <dt className="text-muted-foreground">Quorum required</dt>
                <dd>
                  <Badge variant={minute.quorumRequired ? "success" : "warning"}>
                    {minute.quorumRequired ? "Yes" : "No"}
                  </Badge>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {showEdit && initialFormValues ? (
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
      ) : null}
    </PageContainer>
  );
}
