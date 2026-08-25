"use client";

import * as React from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CalendarSync,
  CircleAlert,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GEM_CATEGORY_LABELS, GemCategory } from "@/lib/gem";
import { swatchHex } from "@/lib/calendarColors";

import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { useTheme } from "../../../components/ThemeProvider";

import { StatusBadge } from "../EventCard";
import { EventFormDialog } from "../EventFormDialog";
import { EventRollDialog, useActiveMembers } from "../EventRollDialog";
import { useEventsData } from "../useEventsData";
import {
  EVENT_TYPE_LABEL,
  formatDateTime,
  isRecurring,
  resolveEventType,
  type EventItem,
} from "../types";

/**
 * One committee's events, and the roll for each of them.
 *
 * The committee comes first and everything else follows from it: a committee
 * head runs one committee, and the events on this page are the ones they are
 * answerable for. Officers get the same screen with every committee in the
 * picker.
 */

const STATUS_FILTERS = [
  { value: "active", label: "Scheduled & ongoing" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Event" },
];

export default function CommitteeEventsWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const { me, events, committees, loading, error, reload, isAdmin, swatchFor } =
    useEventsData();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const members = useActiveMembers();
  const [committeeId, setCommitteeId] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [detail, setDetail] = React.useState<any | null>(null);

  /** The committees this member may run events for. */
  const managed = React.useMemo(() => {
    if (!me) return [];
    if (isAdmin || me.isECouncil) return committees;
    return committees.filter((committee) => {
      const headId =
        typeof committee.committeeHeadId === "string"
          ? committee.committeeHeadId
          : committee.committeeHeadId?._id;
      return headId === me.memberId;
    });
  }, [me, isAdmin, committees]);

  // A head with exactly one committee should not have to pick it.
  React.useEffect(() => {
    if (!committeeId && managed.length === 1) setCommitteeId(managed[0]._id);
  }, [managed, committeeId]);

  const rows = React.useMemo(() => {
    if (!committeeId) return [];
    const statuses = statusFilter === "active" ? ["scheduled", "ongoing"] : [statusFilter];
    const needle = query.trim().toLowerCase();

    return events
      .filter((event) => event.committeeId === committeeId)
      .filter((event) => statuses.includes(event.status))
      .filter(
        (event) => typeFilter === "all" || (event.eventType || "event") === typeFilter
      )
      .filter((event) => !needle || event.name?.toLowerCase().includes(needle))
      .sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
  }, [events, committeeId, statusFilter, typeFilter, query]);

  async function openDetail(eventId: string) {
    const response = await fetch(`/api/events/${eventId}`);
    if (response.ok) setDetail(await response.json());
  }

  async function openEditor(eventId: string) {
    const response = await fetch(`/api/events/${eventId}`);
    if (!response.ok) return;
    setEditing(await response.json());
    setDetail(null);
    setFormOpen(true);
  }

  if (!isLoaded) return <LoadingState message="Loading committee events..." />;

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            You must be signed in to manage committee events.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (loading) return <LoadingState message="Loading committee events..." />;

  if (!managed.length) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>
            You do not run a committee, so there is nothing to manage here.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const selected = committees.find((committee) => committee._id === committeeId);

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Committee events"
        description="Manage events for your committee and keep attendance accurate."
        actions={
          <Button
            type="button"
            disabled={!committeeId}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create committee event
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Events could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Committee</CardTitle>
          <CardDescription>
            Choose a committee to see its events and check people in.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="committee">Committee</Label>
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger id="committee">
                <SelectValue placeholder="Choose a committee" />
              </SelectTrigger>
              <SelectContent>
                {managed.map((committee) => (
                  <SelectItem key={committee._id} value={committee._id}>
                    {committee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="committee-status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="committee-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="committee-type">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="committee-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="committee-search">Search name</Label>
            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                id="committee-search"
                type="search"
                value={query}
                onChange={(change) => setQuery(change.target.value)}
                placeholder="Search events"
                className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-2 border-b sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{selected ? selected.name : "Committee events"}</CardTitle>
            <CardDescription>
              {committeeId
                ? "Click an event to take the roll."
                : "Pick a committee to see its events."}
            </CardDescription>
          </div>
          <Badge variant="muted" className="shrink-0">
            {rows.length === 1 ? "1 event" : `${rows.length} events`}
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">GEM category</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!committeeId ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Select a committee to view its events.
                    </TableCell>
                  </TableRow>
                ) : rows.length ? (
                  rows.map((event) => (
                    <TableRow key={event._id}>
                      <TableCell className="pl-6">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: swatchHex(swatchFor(event), isDark) }}
                          />
                          <span className="min-w-0 font-medium">{event.name}</span>
                          {isRecurring(event) ? (
                            <CalendarSync
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-label="Recurring"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(event.startTime)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={event.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">
                          {EVENT_TYPE_LABEL[resolveEventType(event)]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {event.gemCategory &&
                        GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
                          ? GEM_CATEGORY_LABELS[event.gemCategory as GemCategory]
                          : "Uncategorized"}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openDetail(event._id)}
                          >
                            <ClipboardList className="size-4" />
                            Roll
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${event.name}`}
                            onClick={() => void openEditor(event._id)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No events match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EventRollDialog
        event={detail}
        members={members}
        onClose={() => setDetail(null)}
        onRefresh={openDetail}
        onEdit={(eventId) => void openEditor(eventId)}
      />

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
        committees={managed}
        fixedCommitteeId={committeeId}
        allowChapterWide={false}
        canChangeCommittee={isAdmin}
        onSaved={async () => {
          await reload();
          setEditing(null);
        }}
      />
    </PageContainer>
  );
}
