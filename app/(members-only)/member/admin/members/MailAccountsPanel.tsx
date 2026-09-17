"use client";

// Chapter mailboxes that have been handed out, and what an admin can do to
// them afterwards. Requests still waiting on review stay in the Requests queue.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CirclePause,
  CirclePlay,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldOff,
  Trash2,
  UserRoundPen,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type MailboxStatus = "active" | "suspended" | "revoked";

interface MailboxRow {
  id: string;
  address: string;
  displayName: string;
  status: MailboxStatus;
  pausedByAdmin: boolean;
  statusNote: string;
  statusChangedAt: string | null;
  approvedAt: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  member: { id: string; rollNo: string; name: string; status: string } | null;
  kind: "personal" | "role";
  committeeName: string | null;
}

export interface ReassignCandidate {
  rollNo: string;
  name: string;
  status?: string;
}

type PendingAction =
  | { kind: "pause" | "revoke" | "resume" | "delete"; row: MailboxRow }
  | { kind: "reassign"; row: MailboxRow };

const STATUS_FILTERS = ["all", "active", "suspended", "revoked"] as const;

function StatusBadge({ row }: { row: MailboxRow }) {
  if (row.status === "active") return <Badge variant="success">Active</Badge>;
  if (row.status === "suspended") {
    return (
      <Badge variant="warning">
        {row.pausedByAdmin ? "Paused" : "Frozen"}
      </Badge>
    );
  }
  return <Badge variant="destructive">Revoked</Badge>;
}

function shortDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const COPY: Record<
  "pause" | "revoke" | "resume",
  { title: string; body: (row: MailboxRow) => string; confirm: string }
> = {
  pause: {
    title: "Pause this mailbox?",
    body: (row) =>
      `${row.member?.name ?? "The owner"} won't be able to open ${row.address}, and new mail to it won't be delivered. Everything already in it is kept, and you can resume it at any time.`,
    confirm: "Pause mailbox",
  },
  revoke: {
    title: "Revoke this mailbox?",
    body: (row) =>
      `${row.member?.name ?? "The owner"} loses ${row.address} and is told it was closed. New mail stops being delivered. Their mail is kept, so it can be restored or reassigned later.`,
    confirm: "Revoke mailbox",
  },
  resume: {
    title: "Turn this mailbox back on?",
    body: (row) =>
      `${row.member?.name ?? "The owner"} gets ${row.address} back with everything that was in it, and mail starts arriving again.`,
    confirm: "Resume mailbox",
  },
};

export default function MailAccountsPanel({
  candidates,
}: {
  candidates: ReassignCandidate[];
}) {
  const [rows, setRows] = useState<MailboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [reassignQuery, setReassignQuery] = useState("");
  const [reassignTo, setReassignTo] = useState<ReassignCandidate | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/mail-accounts", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Couldn't load chapter mailboxes.");
      setRows(payload.accounts ?? []);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load chapter mailboxes.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (action: PendingAction) => {
    setPending(action);
    setDialogError(null);
    setNote("");
    setConfirmText("");
    setReassignQuery("");
    setReassignTo(null);
  };

  const close = () => {
    if (working) return;
    setPending(null);
  };

  async function run() {
    if (!pending) return;
    setWorking(true);
    setDialogError(null);
    try {
      const { kind, row } = pending;
      const response =
        kind === "delete"
          ? await fetch(`/api/admin/mail-accounts/${row.id}`, { method: "DELETE" })
          : await fetch(`/api/admin/mail-accounts/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: kind,
                note,
                rollNo: kind === "reassign" ? reassignTo?.rollNo : undefined,
              }),
            });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "That didn't work. Try again.");
      setPending(null);
      await load();
    } catch (err: any) {
      setDialogError(err?.message ?? "That didn't work. Try again.");
    } finally {
      setWorking(false);
    }
  }

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!needle) return true;
      return (
        row.address.includes(needle) ||
        (row.member?.name ?? "").toLowerCase().includes(needle) ||
        (row.member?.rollNo ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      all: all.length,
      active: all.filter((r) => r.status === "active").length,
      suspended: all.filter((r) => r.status === "suspended").length,
      revoked: all.filter((r) => r.status === "revoked").length,
    };
  }, [rows]);

  /// Whoever already holds a mailbox can't be handed a second one, so they
  /// aren't offered.
  const reassignOptions = useMemo(() => {
    if (!pending || pending.kind !== "reassign") return [];
    const holders = new Set((rows ?? []).map((r) => r.member?.rollNo).filter(Boolean));
    const needle = reassignQuery.trim().toLowerCase();
    return candidates
      .filter(
        (c) =>
          ["Active", "Alumni", undefined].includes(c.status) &&
          !holders.has(c.rollNo) &&
          c.rollNo !== "000-ADMIN"
      )
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          c.rollNo.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [pending, rows, candidates, reassignQuery]);

  const canConfirm =
    !working &&
    (!pending ||
      (pending.kind === "reassign"
        ? Boolean(reassignTo)
        : pending.kind === "delete"
          ? confirmText.trim().toLowerCase() === pending.row.address
          : true));

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Mailboxes unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Chapter mailboxes</CardTitle>
            <CardDescription>
              Every chapter email address that has been assigned. New requests
              are reviewed under Requests.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search addresses or names"
                aria-label="Search mailboxes"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={load}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <div className="flex flex-wrap gap-2 border-b px-6 py-3">
          {STATUS_FILTERS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={filter === option ? "default" : "outline"}
              onClick={() => setFilter(option)}
            >
              {option === "all"
                ? "All"
                : option === "active"
                  ? "Active"
                  : option === "suspended"
                    ? "Paused"
                    : "Revoked"}
              <span className="tabular-nums opacity-70">{counts[option]}</span>
            </Button>
          ))}
        </div>

        <CardContent className="p-0">
          {rows === null ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="m-0 p-6 text-sm text-muted-foreground">
              {rows.length === 0
                ? "No chapter mailboxes have been assigned yet."
                : "No mailboxes match."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead>Last mail</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-foreground">
                        {row.address}
                        {row.kind === "role" && (
                          <p className="m-0 mt-0.5 text-xs font-normal text-muted-foreground">
                            {row.committeeName ? `${row.committeeName} committee mailbox` : "Committee mailbox"}
                          </p>
                        )}
                        {row.statusNote && row.status !== "active" ? (
                          <p className="m-0 mt-0.5 max-w-xs truncate text-xs font-normal text-muted-foreground">
                            {row.statusNote}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.member ? (
                          <div className="min-w-0">
                            <p className="m-0 truncate text-sm font-medium text-foreground">{row.member.name}</p>
                            <p className="m-0 text-xs text-muted-foreground">
                              #{row.member.rollNo}
                              {row.member.status && row.member.status !== "Active"
                                ? ` · ${row.member.status}`
                                : ""}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.kind === "role" ? "No committee head" : "No member"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={row} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.messageCount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {shortDate(row.lastMessageAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${row.address}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {row.status === "active" ? (
                              <DropdownMenuItem onSelect={() => open({ kind: "pause", row })}>
                                <CirclePause className="size-4" />
                                Pause
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => open({ kind: "resume", row })}>
                                <CirclePlay className="size-4" />
                                Resume
                              </DropdownMenuItem>
                            )}
                            {row.status !== "revoked" ? (
                              <DropdownMenuItem onSelect={() => open({ kind: "revoke", row })}>
                                <ShieldOff className="size-4" />
                                Revoke
                              </DropdownMenuItem>
                            ) : null}
                            {/* A committee mailbox follows its head: it moves when
                                the head changes, and only goes away with the
                                committee. */}
                            {row.kind !== "role" && (
                              <DropdownMenuItem onSelect={() => open({ kind: "reassign", row })}>
                                <UserRoundPen className="size-4" />
                                Reassign
                              </DropdownMenuItem>
                            )}
                            {(row.kind !== "role" || row.statusNote === "Committee deleted") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => open({ kind: "delete", row })}
                                >
                                  <Trash2 className="size-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pending)} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          {pending ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pending.kind === "reassign"
                    ? `Reassign ${pending.row.address}`
                    : pending.kind === "delete"
                      ? "Delete this mailbox for good?"
                      : COPY[pending.kind].title}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pending.kind === "reassign"
                    ? `The address and all ${pending.row.messageCount} messages in it move to the member you pick. ${pending.row.member?.name ?? "The current owner"} loses access straight away.`
                    : pending.kind === "delete"
                      ? `${pending.row.address} and all ${pending.row.messageCount} messages and attachments in it are removed permanently. This can't be undone, and the address becomes free for anyone to request.`
                      : COPY[pending.kind].body(pending.row)}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {pending.kind === "pause" || pending.kind === "revoke" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mailbox-note">Reason (optional, admins only)</Label>
                  <Textarea
                    id="mailbox-note"
                    value={note}
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                  />
                </div>
              ) : null}

              {pending.kind === "delete" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mailbox-confirm">
                    Type <span className="font-mono">{pending.row.address}</span> to confirm
                  </Label>
                  <Input
                    id="mailbox-confirm"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              ) : null}

              {pending.kind === "reassign" ? (
                <div className="space-y-2">
                  <Label htmlFor="mailbox-reassign">New owner</Label>
                  <Input
                    id="mailbox-reassign"
                    value={reassignQuery}
                    onChange={(event) => {
                      setReassignQuery(event.target.value);
                      setReassignTo(null);
                    }}
                    placeholder="Search by name or roll number"
                    autoComplete="off"
                  />
                  <ul className="max-h-56 space-y-1 overflow-y-auto" role="listbox" aria-label="Members">
                    {reassignOptions.length === 0 ? (
                      <li className="px-2 py-1.5 text-sm text-muted-foreground">
                        No members without a mailbox match.
                      </li>
                    ) : (
                      reassignOptions.map((candidate) => {
                        const selected = reassignTo?.rollNo === candidate.rollNo;
                        return (
                          <li key={candidate.rollNo}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => setReassignTo(candidate)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                                selected && "bg-muted font-medium"
                              )}
                            >
                              <span>{candidate.name}</span>
                              <span className="text-xs text-muted-foreground">
                                #{candidate.rollNo}
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              ) : null}

              {dialogError ? (
                <Alert variant="destructive">
                  <CircleAlert className="size-4" />
                  <AlertDescription>{dialogError}</AlertDescription>
                </Alert>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
                {/* A plain button, not AlertDialogAction, so the dialog stays
                    open to show an error instead of closing on click. */}
                <Button
                  type="button"
                  variant={pending.kind === "delete" || pending.kind === "revoke" ? "destructive" : "default"}
                  disabled={!canConfirm}
                  onClick={run}
                  className="gap-2"
                >
                  {working ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {pending.kind === "reassign"
                    ? reassignTo
                      ? `Give it to ${reassignTo.name.split(" ")[0]}`
                      : "Reassign"
                    : pending.kind === "delete"
                      ? "Delete permanently"
                      : COPY[pending.kind].confirm}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
