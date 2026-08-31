"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface AttendanceRow {
  memberId: string;
  rollNo: string;
  firstName: string;
  lastName: string;
  attended: number;
  held: number;
  lastAttendedAt: string | null;
  onCommittee: boolean;
}

interface Attendance {
  committeeName: string;
  /// The term these counts cover. The route scopes to the current one unless
  /// asked for another, so this is named on screen rather than left implicit —
  /// "3 meetings" with no term attached is what made the old all-time tally
  /// look like this semester's.
  term: string;
  meetingsHeld: number;
  members: AttendanceRow[];
}

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "America/Phoenix",
      }).format(new Date(value))
    : "";

/**
 * Who has been turning up to one committee's meetings.
 *
 * Mirrors the section on the committee page in the iOS app, from the same
 * endpoint. The route refuses anybody who is not an officer or this
 * committee's chair, so this renders nothing at all on a 403 rather than
 * explaining what it is not showing: a member who cannot see it has no reason
 * to be told the section exists.
 */
export default function CommitteeAttendance({
  committeeId,
}: {
  committeeId: string;
}) {
  const [data, setData] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDenied(false);
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/committees/${committeeId}/attendance`);
        if (res.status === 403 || res.status === 401) {
          if (!cancelled) setDenied(true);
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // Nothing to show, and nothing worth saying about it inside a dialog
        // somebody opened to look at the roster.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [committeeId]);

  if (denied) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading attendance
      </div>
    );
  }

  if (!data) return null;

  if (data.meetingsHeld === 0) {
    return (
      <div>
        <h4 className="mb-1 text-sm font-semibold text-foreground">Attendance</h4>
        <p className="text-sm text-muted-foreground">
          No meetings have been held in {data.term || "this term"}, so there is
          nothing to count.
        </p>
      </div>
    );
  }

  // Everyone currently on the committee, across every meeting held this term.
  const current = data.members.filter((row) => row.onCommittee);
  const possible = data.meetingsHeld * current.length;
  const actual = current.reduce((sum, row) => sum + row.attended, 0);
  const turnout = possible > 0 ? Math.round((actual / possible) * 100) : null;

  return (
    <div>
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        Attendance
        <span className="font-normal text-muted-foreground">
          {data.term ? `${data.term} · ` : ""}
          {data.meetingsHeld === 1 ? "1 meeting" : `${data.meetingsHeld} meetings`}
          {turnout !== null ? ` · ${turnout}% turnout` : ""}
        </span>
      </h4>

      <ul className="divide-y divide-border rounded-md border border-border">
        {data.members.map((row) => {
          const rate = row.held > 0 ? row.attended / row.held : 0;
          return (
            <li
              key={row.memberId}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <span className="truncate">
                    {row.firstName} {row.lastName}
                  </span>
                  {/* Attended, then came off the committee. The rows still
                      count toward what happened. */}
                  {!row.onCommittee ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Former
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    row.rollNo ? `#${row.rollNo}` : "",
                    row.lastAttendedAt
                      ? `last ${formatDate(row.lastAttendedAt)}`
                      : "never attended",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {row.attended} of {row.held}
              </span>
              <Progress
                value={rate * 100}
                className="h-1.5 w-16 shrink-0"
                aria-label={`${row.firstName} ${row.lastName} attended ${row.attended} of ${row.held} meetings`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
