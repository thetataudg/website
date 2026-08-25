"use client";

import * as React from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { GEM_CATEGORIES, GEM_CATEGORY_LABELS, GemCategory } from "@/lib/gem";
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
 * Every event the chapter has, from the side of whoever runs them.
 *
 * A table rather than cards: this is the screen somebody opens knowing the
 * event exists and wanting to change one field of it, and a table is what
 * lets them find it by scanning a column.
 */

const EVENTS_PER_PAGE = 15;

const STATUS_FILTERS = [
  { value: "active", label: "Active (scheduled / ongoing)" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Event" },
  { value: "chapter", label: "Chapter" },
];

export default function ManageEventsWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const { me, events, committees, loading, error, reload, isAdmin, committeeLabel, swatchFor } =
    useEventsData();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [statusFilter, setStatusFilter] = React.useState("active");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [committeeFilter, setCommitteeFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [deleting, setDeleting] = React.useState<EventItem | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [roll, setRoll] = React.useState<any | null>(null);
  const members = useActiveMembers();

  const canCreate = !!me && (isAdmin || me.isECouncil);

  /** Committee heads only manage their own; officers manage everything. */
  const managed = React.useMemo(() => {
    if (!me) return [];
    if (isAdmin || me.isECouncil) return events;
    const mine = committees.map((committee) => committee._id);
    return events.filter((event) => mine.includes(event.committeeId ?? ""));
  }, [me, isAdmin, events, committees]);

  const filtered = React.useMemo(() => {
    const statuses = statusFilter === "active" ? ["scheduled", "ongoing"] : [statusFilter];
    const needle = query.trim().toLowerCase();

    return managed.filter((event) => {
      if (!statuses.includes(event.status)) return false;

      const type = resolveEventType(event);
      if (typeFilter !== "all" && type !== typeFilter) return false;

      if (committeeFilter === "chapter") {
        if (type !== "chapter") return false;
      } else if (committeeFilter !== "all" && event.committeeId !== committeeFilter) {
        return false;
      }

      const category = event.gemCategory || "uncategorized";
      if (categoryFilter !== "all" && category !== categoryFilter) return false;

      return !needle || event.name?.toLowerCase().includes(needle);
    });
  }, [managed, statusFilter, typeFilter, committeeFilter, categoryFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / EVENTS_PER_PAGE));

  // A filter that shortens the list must not leave the reader on a page that
  // no longer exists.
  React.useEffect(() => setPage(1), [statusFilter, typeFilter, committeeFilter, categoryFilter, query]);
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const rows = filtered.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE);

  async function openEditor(eventId: string) {
    const response = await fetch(`/api/events/${eventId}`);
    if (!response.ok) return;
    setEditing(await response.json());
    setFormOpen(true);
  }

  /**
   * The roll, reachable from every row rather than only from finished events.
   *
   * Attendance gets corrected long after the fact — somebody signed in on
   * paper, somebody's phone died — so the officer who has to fix it should not
   * have to go and find the committee page to do it.
   */
  async function openRoll(eventId: string) {
    const response = await fetch(`/api/events/${eventId}`);
    if (response.ok) setRoll(await response.json());
  }

  /**
   * Deleting a finished event with a roll attached is an admin's call: the
   * attendance on it is the only record that those members were there.
   */
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (!isAdmin) {
        const response = await fetch(`/api/events/${deleting._id}`);
        if (response.ok) {
          const detail = await response.json();
          if (detail.status === "completed" && detail.attendees?.length) {
            setDeleteError("Only admins can delete completed events with attendees.");
            return;
          }
        }
      }

      const response = await fetch(`/api/events/${deleting._id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The event could not be deleted.");
      }
      await reload();
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "The event could not be deleted.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!isLoaded) return <LoadingState message="Loading events..." />;

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>You must be signed in to manage events.</AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (loading) return <LoadingState message="Loading events..." />;

  if (!canCreate) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>
            Only admins and E-Council can manage chapter events.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Manage events"
        description="Create, edit, and organize chapter or committee events."
        actions={
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create event
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
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow the list down to what you came for.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="filter-status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="filter-status">
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
            <Label htmlFor="filter-type">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="filter-type">
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
            <Label htmlFor="filter-committee">Committee</Label>
            <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
              <SelectTrigger id="filter-committee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All committees</SelectItem>
                <SelectItem value="chapter">Chapter-wide</SelectItem>
                {committees.map((committee) => (
                  <SelectItem key={committee._id} value={committee._id}>
                    {committee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-category">GEM category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="filter-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All GEM categories</SelectItem>
                {GEM_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {GEM_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-name">Event name</Label>
            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                id="filter-name"
                type="search"
                value={query}
                onChange={(change) => setQuery(change.target.value)}
                placeholder="Search"
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
            <CardTitle>Events</CardTitle>
            <CardDescription>
              {filtered.length === 1
                ? "1 event matching your filters"
                : `${filtered.length} events matching your filters`}
            </CardDescription>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Committee</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Category</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-14 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((event) => (
                    <TableRow key={event._id}>
                      <TableCell className="pl-6">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: swatchHex(swatchFor(event), isDark) }}
                          />
                          <button
                            type="button"
                            onClick={() => void openRoll(event._id)}
                            className="min-w-0 truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {event.name}
                          </button>
                          {isRecurring(event) ? (
                            <CalendarSync
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-label="Recurring"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {committeeLabel(event)}
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
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(event.startTime)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={event.status} />
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${event.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Event actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => void openEditor(event._id)}>
                              <Pencil className="size-4" />
                              Edit event
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void openRoll(event._id)}>
                              <ClipboardList className="size-4" />
                              Take the roll
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => {
                                setDeleteError(null);
                                setDeleting(event);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Delete event
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="rounded-full bg-muted p-3">
                          <Search className="size-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">No events found</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Try a different filter or search.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        <CardHeader className="flex-row items-center justify-between border-t py-4">
          <p className="text-sm text-muted-foreground">
            {filtered.length
              ? `Showing ${(page - 1) * EVENTS_PER_PAGE + 1}–${Math.min(
                  filtered.length,
                  page * EVENTS_PER_PAGE
                )} of ${filtered.length}`
              : "Nothing to show"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
        committees={committees}
        allowChapterWide
        canChangeCommittee={isAdmin}
        onSaved={async () => {
          await reload();
          setEditing(null);
        }}
      />

      <EventRollDialog
        event={roll}
        members={members}
        onClose={() => setRoll(null)}
        onRefresh={openRoll}
        onEdit={(eventId) => {
          setRoll(null);
          void openEditor(eventId);
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be removed, along with any attendance recorded
              against it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete event
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
