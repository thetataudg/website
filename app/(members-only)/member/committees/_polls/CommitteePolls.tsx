"use client";

// The "availability polls" panel on a committee dashboard. Members see the
// polls they can fill in; the head also gets "new poll" and the results link.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, Loader2, Plus } from "lucide-react";
import { DateTime } from "luxon";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeader } from "../../../components/shell/PageShell";
import { deadlineCountdown, type PollSummary } from "./pollClient";
import PollCreateForm from "./PollCreateForm";
import { PollManagerMenu } from "./PollManagerMenu";

const STATUS_VARIANT: Record<string, "default" | "muted" | "outline" | "success"> =
  {
    open: "default",
    closed: "outline",
    scheduled: "success",
    cancelled: "muted",
  };

export default function CommitteePolls({
  committeeId,
  committeeName,
  canManage,
  baseHref,
}: {
  committeeId: string;
  committeeName: string;
  canManage: boolean;
  baseHref: string;
}) {
  const router = useRouter();
  const [polls, setPolls] = React.useState<PollSummary[] | null>(null);
  const [creating, setCreating] = React.useState(false);

  const reload = React.useCallback(() => {
    fetch(`/api/availability?committeeId=${committeeId}`)
      .then((r) => (r.ok ? r.json() : { polls: [] }))
      .then((d) => setPolls(d.polls ?? []))
      .catch(() => setPolls([]));
  }, [committeeId]);

  React.useEffect(reload, [reload]);

  return (
    <section>
      <SectionHeader
        title="Availability polls"
        description="When can we meet?"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New poll
            </Button>
          ) : null
        }
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New availability poll</DialogTitle>
          </DialogHeader>
          <PollCreateForm
            committeeId={committeeId}
            committeeName={committeeName}
            onCancel={() => setCreating(false)}
            onDone={(poll) => {
              setCreating(false);
              reload();
              router.push(`${baseHref}/polls/${poll._id}`);
            }}
          />
        </DialogContent>
      </Dialog>

      {polls === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : polls.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No polls yet.
            {canManage
              ? " Start one to find a time that works for everyone."
              : ""}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid list-none gap-2 p-0">
          {polls.map((p) => (
            <li key={p._id}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <CalendarClock className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {p.title}
                      </span>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                        {p.status}
                      </Badge>
                      {!p.hasResponded && p.status === "open" && (
                        <Badge variant="warning">Needs you</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.respondedCount ?? 0}/{p.inviteeCount ?? 0} answered
                      {p.status === "open" && (
                        <>
                          {" · closes "}
                          {DateTime.fromISO(p.deadline).toFormat("LLL d")} (
                          {deadlineCountdown(p.deadline)})
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canManage && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`${baseHref}/polls/${p._id}/results`}>
                          Results
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${baseHref}/polls/${p._id}`}>
                        {p.status === "open" && !p.hasResponded
                          ? "Fill in"
                          : "Open"}
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                    {canManage && (
                      <PollManagerMenu poll={p} onChanged={reload} size="icon" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
