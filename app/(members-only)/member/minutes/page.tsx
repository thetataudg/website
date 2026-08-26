"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CalendarDays,
  Clock3,
  FileText,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EmptyState, LoadingState } from "../../components/shell/States";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import MinuteFormModal, {
  EventOption,
  MinuteFormValues,
} from "./components/MinuteFormModal";

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

const MINUTES_PER_PAGE = 9;

const getPaginationItems = (currentPage: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const validPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  validPages.forEach((page, index) => {
    const previousPage = validPages[index - 1];
    if (previousPage && page - previousPage > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
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
  const [currentPage, setCurrentPage] = useState(1);
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
        const options = eventData.map((event) => ({
          _id: event._id,
          name: event.name,
          startTime: event.startTime,
          committeeName: event.committeeId
            ? committeeNames.get(String(event.committeeId))
            : "Chapter-wide",
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
      setCurrentPage(1);
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

  const totalPages = Math.max(
    1,
    Math.ceil(filteredMinutes.length / MINUTES_PER_PAGE)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMinutes = useMemo(() => {
    const start = (safeCurrentPage - 1) * MINUTES_PER_PAGE;
    return filteredMinutes.slice(start, start + MINUTES_PER_PAGE);
  }, [filteredMinutes, safeCurrentPage]);
  const paginationItems = getPaginationItems(safeCurrentPage, totalPages);

  if (!isLoaded) {
    return (
      <PageContainer>
        <LoadingState label="Loading minutes…" rows={4} />
      </PageContainer>
    );
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CalendarDays className="size-4" aria-hidden="true" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            You must be signed in to view chapter minutes.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Meeting minutes"
        description="Review chapter records, attendance, quorum, and meeting summaries."
        actions={
          canManageMinutes ? (
            <Button onClick={openModal} className="gap-2">
              <Plus className="size-4" aria-hidden="true" />
              New minutes
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-4">
          {/* Structural search field shared with the admin roster: the icon,
            * input, and clear control are siblings, so they cannot overlap. */}
          <div className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:max-w-xl">
            <Search
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
            <input
              type="search"
              placeholder="Search by summary, event, or date…"
              aria-label="Search meeting minutes"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                aria-label="Clear minutes search"
                className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {formError && !modalOpen ? (
        <Alert variant="destructive">
          <AlertTitle>Minutes could not be saved</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingState label="Loading minutes…" rows={4} />
      ) : minutes.length === 0 ? (
        <EmptyState
          title="No minutes published yet"
          description={
            canManageMinutes
              ? "Create the first meeting record to get started."
              : "Published meeting records will appear here."
          }
          icon={<FileText aria-hidden="true" />}
          action={
            canManageMinutes ? (
              <Button onClick={openModal}>
                <Plus className="size-4" aria-hidden="true" />
                New minutes
              </Button>
            ) : null
          }
        />
      ) : filteredMinutes.length === 0 ? (
        <EmptyState
          title="No matching minutes"
          description="Try a different summary, event, or date."
          icon={<Search aria-hidden="true" />}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setCurrentPage(1);
              }}
            >
              Clear search
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
            {paginatedMinutes.map((minute) => {
              const slug =
                minute.meetingDateKey || minute.meetingDate.split("T")[0];
              return (
                <li key={minute._id} className="min-w-0">
                  <Link
                    href={`/member/minutes/${slug}`}
                    className="group block h-full rounded-lg text-card-foreground no-underline visited:text-card-foreground hover:text-card-foreground hover:no-underline focus:text-card-foreground focus:no-underline active:text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Card className="h-full transition-colors group-hover:border-primary/50">
                      <CardContent className="flex h-full flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Meeting date
                            </p>
                            <h2 className="mt-1 text-base font-semibold text-foreground">
                              {formatDate(minute.meetingDate)}
                            </h2>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                            <FileText className="size-4" aria-hidden="true" />
                            {minute.hidden ? (
                              <Badge variant="secondary">Hidden</Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge variant="muted">
                            <Clock3 className="size-3" aria-hidden="true" />
                            {formatDuration(minute.startTime, minute.endTime)}
                          </Badge>
                          <Badge variant="muted">
                            <Users className="size-3" aria-hidden="true" />
                            {minute.activesPresent} active
                            {minute.activesPresent === 1 ? "" : "s"}
                          </Badge>
                          <Badge
                            variant={
                              minute.quorumRequired ? "success" : "warning"
                            }
                          >
                            Quorum: {minute.quorumRequired ? "Yes" : "No"}
                          </Badge>
                        </div>

                        {minute.eventName ? (
                          <p className="mt-4 text-sm font-medium text-foreground">
                            {minute.eventName}
                          </p>
                        ) : null}
                        {minute.executiveSummary ? (
                          <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-muted-foreground">
                            {minute.executiveSummary}
                          </p>
                        ) : (
                          <p className="mt-4 text-sm text-muted-foreground">
                            Open the record to view the attached minutes.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pagination className="pt-2">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={safeCurrentPage === 1}
                  tabIndex={safeCurrentPage === 1 ? -1 : undefined}
                  className={
                    safeCurrentPage === 1
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentPage((page) => Math.max(1, page - 1));
                  }}
                />
              </PaginationItem>

              {paginationItems.map((item, index) =>
                item === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${index}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href="#"
                      isActive={item === safeCurrentPage}
                      aria-label={`Go to page ${item}`}
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage(item);
                      }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={safeCurrentPage === totalPages}
                  tabIndex={safeCurrentPage === totalPages ? -1 : undefined}
                  className={
                    safeCurrentPage === totalPages
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentPage((page) => Math.min(totalPages, page + 1));
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </>
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
        error={formError}
      />
    </PageContainer>
  );
}
