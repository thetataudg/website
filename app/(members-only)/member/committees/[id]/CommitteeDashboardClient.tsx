"use client";

// One committee, one page: its roster, its meetings, its availability polls,
// and its attendance. The head gets the "schedule an event" and "new poll"
// controls; everyone else on the roster gets the read + their own grid.
import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  Crown,
  History,
  Loader2,
  Pencil,
  Users,
} from "lucide-react";
import { DateTime } from "luxon";

import {
  PageContainer,
  PageHeader,
  SectionHeader,
} from "../../../components/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useEventManagement } from "../../events/useEventManagement";
import CommitteeAttendance from "../CommitteeAttendance";
import CommitteePolls from "../_polls/CommitteePolls";
import CommitteeTasksCard from "../CommitteeTasksCard";

interface MemberRef {
  _id?: string;
  fName?: string;
  lName?: string;
  rollNo?: string;
}
const name = (m?: string | MemberRef) => {
  if (!m || typeof m === "string") return "Unassigned";
  const n = `${m.fName ?? ""} ${m.lName ?? ""}`.trim();
  return n ? `${n}${m.rollNo ? ` (#${m.rollNo})` : ""}` : "Unassigned";
};

export default function CommitteeDashboardClient({
  committeeId,
}: {
  committeeId: string;
}) {
  const [committee, setCommittee] = React.useState<any>(null);
  const [events, setEvents] = React.useState<any[]>([]);
  const [pastEvents, setPastEvents] = React.useState<any[] | null>(null);
  const [showPast, setShowPast] = React.useState(false);
  const [viewer, setViewer] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadEvents = React.useCallback(async () => {
    const res = await fetch(
      `/api/events?committeeId=${committeeId}&includePast=false`
    );
    if (res.ok) setEvents(await res.json());
  }, [committeeId]);

  // Finished meetings, newest first, so a head can take or fix the roll
  // without going through Events > Manage > Completed.
  const loadPastEvents = React.useCallback(async () => {
    const res = await fetch(
      `/api/events?committeeId=${committeeId}&includePast=true`
    );
    if (!res.ok) {
      setPastEvents([]);
      return;
    }
    // Over and not cancelled, whether or not the lifecycle job has flipped it
    // to "completed" yet.
    const now = Date.now();
    const rows: any[] = (await res.json()).filter(
      (e: any) =>
        e.status !== "cancelled" &&
        new Date(e.endTime ?? e.startTime).getTime() < now
    );
    rows.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    setPastEvents(rows);
  }, [committeeId]);

  const reloadAll = React.useCallback(async () => {
    await loadEvents();
    if (pastEvents !== null) await loadPastEvents();
  }, [loadEvents, loadPastEvents, pastEvents]);

  React.useEffect(() => {
    (async () => {
      try {
        const [c, meRes] = await Promise.all([
          fetch(`/api/committees/${committeeId}`),
          fetch("/api/members/me"),
        ]);
        if (!c.ok) throw new Error("This committee could not be loaded.");
        setCommittee(await c.json());
        if (meRes.ok) setViewer(await meRes.json());
        await loadEvents();
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [committeeId, loadEvents]);

  // The dialogs for making, editing and taking the roll for this committee's
  // events. New events are pinned to this committee.
  const management = useEventManagement({
    onChanged: reloadAll,
    fixedCommitteeId: committeeId,
  });

  const canManage = React.useMemo(() => {
    if (!viewer || !committee) return false;
    if (viewer.role === "admin" || viewer.role === "superadmin" || viewer.isECouncil)
      return true;
    const head = committee.committeeHeadId;
    const headId = typeof head === "string" ? head : head?._id?.toString?.();
    return Boolean(headId && viewer.memberId && headId === viewer.memberId);
  }, [viewer, committee]);

  if (error) {
    return (
      <PageContainer>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      </PageContainer>
    );
  }
  if (!committee) {
    return (
      <PageContainer>
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  const members: MemberRef[] = (committee.committeeMembers || []).filter(
    (m: any) => m && typeof m !== "string"
  );
  const baseHref = `/member/committees/${committeeId}`;

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={
          <Link
            href="/member/committees"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All committees
          </Link>
        }
        title={committee.name}
        description={committee.description || undefined}
        actions={
          canManage ? (
            <Button onClick={management.openCreate}>
              <CalendarPlus className="size-4" /> Schedule event
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-[14rem] flex-1">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Head
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Crown className="size-3.5 text-muted-foreground" />
              {name(committee.committeeHeadId)}
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-[14rem] flex-[2]">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" /> {members.length} member
              {members.length === 1 ? "" : "s"}
            </p>
            {members.length > 0 && (
              <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
                {members.map((m) => (
                  <li key={m._id}>
                    <Badge variant="muted">{name(m)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <SectionHeader
          title={showPast ? "Past meetings" : "Upcoming meetings"}
          description={
            showPast
              ? "Open one to take or fix its attendance."
              : "Committee events. Chapter-wide events still live under Events."
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              aria-pressed={showPast}
              onClick={() => {
                const next = !showPast;
                setShowPast(next);
                if (next && pastEvents === null) void loadPastEvents();
              }}
            >
              {showPast ? (
                <>
                  <CalendarPlus className="size-4" /> Upcoming
                </>
              ) : (
                <>
                  <History className="size-4" /> Past events
                </>
              )}
            </Button>
          }
        />
        {showPast && pastEvents === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (showPast ? pastEvents ?? [] : events).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {showPast ? "No past meetings yet." : "Nothing scheduled."}
            </CardContent>
          </Card>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {(showPast ? pastEvents ?? [] : events).map((e) => (
              <li key={e._id}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{e.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {DateTime.fromISO(e.startTime).toFormat(
                          showPast ? "EEE LLL d, yyyy" : "EEE LLL d, h:mm a"
                        )}
                        {showPast
                          ? ` · ${(e.attendees || []).length} attended`
                          : e.location
                            ? ` · ${e.location}`
                            : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {e.canManage ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void management.openRoll(e._id)}
                          >
                            <ClipboardList className="size-4" /> Attendance
                          </Button>
                          {!showPast ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void management.openEdit(e._id)}
                            >
                              <Pencil className="size-4" /> Edit
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/member/events/${e._id}`}>Open</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CommitteeTasksCard committeeId={committeeId} />

      <CommitteePolls
        committeeId={committeeId}
        committeeName={committee.name}
        canManage={canManage}
        baseHref={baseHref}
      />

      <section>
        <SectionHeader title="Attendance" />
        <CommitteeAttendance committeeId={committeeId} />
      </section>

      {management.dialogs}
    </PageContainer>
  );
}
