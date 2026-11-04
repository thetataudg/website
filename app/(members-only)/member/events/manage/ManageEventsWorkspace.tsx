"use client";

import * as React from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
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
import { useEventManagement } from "../useEventManagement";
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

/** How far back "Recent" reaches. */
const RECENT_DAYS = 14;

const STATUS_FILTERS = [
  { value: "recent", label: "Recent and upcoming" },
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
  const {
    viewer,
    events,
    committees,
    loading,
    error,
    reload,
    committeeLabel,
    swatchFor,
  } = useEventsData();
  const management = useEventManagement({ viewer, onChanged: reload });
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // "Recent" is the default because the most common reason to open this page
  // is a meeting that just ended: attendance to fix, or a check-in to reopen.
  // Scheduled and ongoing events are one filter away, and a finished event is
  // no longer buried under "Completed" in a list that opens on upcoming ones.
  const [statusFilter, setStatusFilter] = React.useState("recent");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [committeeFilter, setCommitteeFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);


  /**
   * Only what the viewer can manage, as the server judged it: officers get
   * everything, a committee head gets the events of the committee they head.
   */
  const managed = React.useMemo(() => events.filter((event) => event.canManage), [events]);

  const filtered = React.useMemo(() => {
    const statuses =
      statusFilter === "active"
        ? ["scheduled", "ongoing"]
        : statusFilter === "recent"
        ? ["scheduled", "ongoing", "completed"]
        : [statusFilter];
    const needle = query.trim().toLowerCase();
    const recentCutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

    return managed.filter((event) => {
      if (!statuses.includes(event.status)) return false;
      if (
        statusFilter === "recent" &&
        event.status === "completed" &&
        new Date(event.endTime).getTime() < recentCutoff
      ) {
        return false;
      }

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

  // Reaching this page needs the standing to manage some event: an officer,
  // or the head of a committee.
  if (!management.canCreate) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>
            Only admins, E-Council, and committee heads can manage events.
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
          <Button type="button" onClick={management.openCreate}>
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
                            onClick={() => void management.openRoll(event._id)}
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
                            <DropdownMenuItem onSelect={() => void management.openEdit(event._id)}>
                              <Pencil className="size-4" />
                              Edit event
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void management.openRoll(event._id)}>
                              <ClipboardList className="size-4" />
                              Take the roll
                            </DropdownMenuItem>
                            {event.canDelete ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => management.requestDelete(event)}
                                >
                                  <Trash2 className="size-4" />
                                  Delete event
                                </DropdownMenuItem>
                              </>
                            ) : null}
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

      {management.dialogs}
    </PageContainer>
  );
}
