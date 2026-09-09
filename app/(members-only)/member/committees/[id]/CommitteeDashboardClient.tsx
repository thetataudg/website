"use client";

// One committee, one page: its roster, its meetings, its availability polls,
// and its attendance. The head gets the "schedule an event" and "new poll"
// controls; everyone else on the roster gets the read + their own grid.
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Crown, Loader2, Users } from "lucide-react";
import { DateTime } from "luxon";

import {
  PageContainer,
  PageHeader,
  SectionHeader,
} from "../../../components/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EventFormDialog } from "../../events/EventFormDialog";
import CommitteeAttendance from "../CommitteeAttendance";
import CommitteePolls from "../_polls/CommitteePolls";

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
  const [viewer, setViewer] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scheduling, setScheduling] = React.useState(false);

  const loadEvents = React.useCallback(async () => {
    const res = await fetch(
      `/api/events?committeeId=${committeeId}&includePast=false`
    );
    if (res.ok) setEvents(await res.json());
  }, [committeeId]);

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
            <Button onClick={() => setScheduling(true)}>
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
          title="Upcoming meetings"
          description="Committee events. Chapter-wide events still live under Events."
        />
        {events.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing scheduled.
            </CardContent>
          </Card>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {events.map((e) => (
              <li key={e._id}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{e.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {DateTime.fromISO(e.startTime).toFormat(
                          "EEE LLL d, h:mm a"
                        )}
                        {e.location ? ` · ${e.location}` : ""}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/member/events/${e._id}`}>Open</Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <EventFormDialog
        open={scheduling}
        onOpenChange={setScheduling}
        event={null}
        committees={[committee]}
        fixedCommitteeId={committeeId}
        allowChapterWide={false}
        canChangeCommittee={false}
        onSaved={async () => {
          setScheduling(false);
          await loadEvents();
        }}
      />
    </PageContainer>
  );
}
