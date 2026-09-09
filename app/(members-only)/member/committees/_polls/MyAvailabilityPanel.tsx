"use client";

// "Needs your availability" — the member-dashboard strip at the top of the
// Committees page. Only renders when something is actually waiting.
import * as React from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "../../../components/shell/PageShell";
import { deadlineCountdown, pollApi, type PollSummary } from "./pollClient";

export default function MyAvailabilityPanel() {
  const [polls, setPolls] = React.useState<PollSummary[]>([]);

  React.useEffect(() => {
    pollApi
      .list()
      .then((d) => setPolls(d.waitingOnMe ?? []))
      .catch(() => setPolls([]));
  }, []);

  if (polls.length === 0) return null;

  const hrefFor = (p: PollSummary) =>
    p.committeeId
      ? `/member/committees/${p.committeeId}/polls/${p._id}`
      : `/member/committees/polls/${p._id}`;

  return (
    <section>
      <SectionHeader
        title="Needs your availability"
        description="Paint when you are free so these can be scheduled."
      />
      <ul className="grid list-none gap-2 p-0">
        {polls.map((p) => (
          <li key={p._id}>
            <Link href={hrefFor(p)}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <CalendarClock className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{p.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.respondedCount ?? 0}/{p.inviteeCount ?? 0} answered
                    </div>
                  </div>
                  <Badge variant="warning">{deadlineCountdown(p.deadline)}</Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
