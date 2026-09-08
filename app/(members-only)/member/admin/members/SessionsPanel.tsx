"use client";

// Signed-in devices, live from Clerk.
//
// Deliberately not seeded from the server render: the list is only true for
// the moment it was fetched, and a stale roster of who is "currently" signed
// in is worse than a brief spinner. Refreshes on demand and every minute.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  Loader2,
  LogOut,
  Monitor,
  RefreshCw,
  Smartphone,
  ShieldQuestion,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Platform = "ios" | "web" | "unknown";

interface SessionRow {
  sessionId: string;
  clerkId: string;
  platform: Platform;
  deviceLabel: string;
  ipAddress: string;
  location: string;
  lastActiveAt: string | null;
  expireAt: string | null;
  rollNo: string | null;
  name: string | null;
  role: string | null;
  activeInAppNow: boolean;
}

interface Summary {
  total: number;
  ios: number;
  web: number;
  unknown: number;
  members: number;
  inAppNow: number;
  activeWindowMinutes: number;
}

const REFRESH_MS = 60_000;

/// Coarse on purpose. An admin is asking "is this person on right now", and a
/// stamp to the second invites a precision the data does not have.
function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const PLATFORM_META: Record<
  Platform,
  { label: string; icon: typeof Smartphone; className: string }
> = {
  ios: {
    label: "iOS app",
    icon: Smartphone,
    className: "border-transparent bg-emerald-600 text-white",
  },
  web: {
    label: "Web",
    icon: Monitor,
    className: "border-transparent bg-sky-600 text-white",
  },
  unknown: {
    label: "Unknown",
    icon: ShieldQuestion,
    className: "border-transparent bg-muted text-muted-foreground",
  },
};

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function SessionsPanel({ canRevoke }: { canRevoke: boolean }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<SessionRow | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Platform>("all");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/sessions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Unable to load sessions");
      setSessions(payload.sessions ?? []);
      setSummary(payload.summary ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Unable to load sessions");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const revoke = useCallback(
    async (session: SessionRow) => {
      setRevokingId(session.sessionId);
      try {
        const response = await fetch(`/api/admin/sessions/${session.sessionId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          // Sent so the member can be told which device was signed out. Clerk
          // has already forgotten the session by the time they come back and
          // ask.
          body: JSON.stringify({
            clerkId: session.clerkId,
            deviceLabel: session.deviceLabel,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error ?? "Unable to revoke session");
        // Drop the row immediately rather than waiting for the refetch: the
        // session is gone, and leaving it on screen invites a second click.
        setSessions((current) =>
          (current ?? []).filter((row) => row.sessionId !== session.sessionId)
        );
        setError(null);
        load();
      } catch (err: any) {
        setError(err?.message ?? "Unable to revoke session");
      } finally {
        setRevokingId(null);
        setPendingRevoke(null);
      }
    },
    [load]
  );

  const visible = useMemo(() => {
    if (!sessions) return [];
    if (filter === "all") return sessions;
    return sessions.filter((row) => row.platform === filter);
  }, [sessions, filter]);

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sessions unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="On iPhone"
          value={summary?.ios ?? "—"}
          hint={
            summary
              ? `${summary.inAppNow} active in the last ${summary.activeWindowMinutes}m`
              : undefined
          }
        />
        <StatTile label="On web" value={summary?.web ?? "—"} />
        <StatTile
          label="Signed-in brothers"
          value={summary?.members ?? "—"}
          hint="Distinct people, not devices."
        />
        <StatTile label="Total sessions" value={summary?.total ?? "—"} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>
              Every device currently signed in to the chapter tools. Refreshes
              on its own each minute.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "ios", "web"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={filter === option ? "default" : "outline"}
                onClick={() => setFilter(option)}
              >
                {option === "all"
                  ? "All"
                  : option === "ios"
                    ? "iOS app"
                    : "Web"}
              </Button>
            ))}
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

        <CardContent className="p-0">
          {sessions === null ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="m-0 p-6 text-sm text-muted-foreground">
              {filter === "all"
                ? "Nobody is signed in right now."
                : "No sessions on this platform right now."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Where</TableHead>
                    <TableHead>Last active</TableHead>
                    {canRevoke ? (
                      <TableHead className="text-right">Session</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const meta = PLATFORM_META[row.platform];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={row.sessionId}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="m-0 truncate font-medium text-foreground">
                              {row.name ?? "Unrecognised account"}
                            </p>
                            <p className="m-0 text-xs text-muted-foreground">
                              {row.rollNo ? `#${row.rollNo}` : row.clerkId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={meta.className}>
                              <Icon className="mr-1 size-3" aria-hidden="true" />
                              {meta.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {row.deviceLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.location || row.ipAddress || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {relativeTime(row.lastActiveAt)}
                          {row.activeInAppNow ? (
                            <span className="ml-2 text-emerald-600">• in app</span>
                          ) : null}
                        </TableCell>
                        {canRevoke ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              disabled={revokingId === row.sessionId}
                              onClick={() => setPendingRevoke(row)}
                            >
                              {revokingId === row.sessionId ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <LogOut className="size-4" aria-hidden="true" />
                              )}
                              Revoke
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign this device out?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke
                ? `${pendingRevoke.name ?? "This account"} will be signed out of ${
                    pendingRevoke.deviceLabel
                  } within about a minute. They can sign back in straight away.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRevoke && revoke(pendingRevoke)}
            >
              Revoke session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
