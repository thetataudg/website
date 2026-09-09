"use client";

// The grid screen. Paint your availability, or flip to the group heatmap. Any
// invitee lands here from the nag; the head gets a link on to the results.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import {
  buildHeat,
  columnsForPoll,
  deadlineCountdown,
  pollApi,
  type PollDetailResponse,
} from "./pollClient";
import { SharePollButton } from "./SharePollButton";
import { PollManagerMenu } from "./PollManagerMenu";
import { DateTime } from "luxon";

export default function PollRespondClient({
  pollId,
  backHref,
  resultsHref,
}: {
  pollId: string;
  backHref: string;
  resultsHref: string;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<PollDetailResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"paint" | "heatmap">("paint");
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await pollApi.get(pollId);
      setData(res);
      setSelected(new Set(res.myResponseSlots));
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    }
  }, [pollId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = React.useCallback(
    async (slots: Set<number>) => {
      setSaving(true);
      try {
        await pollApi.saveResponse(pollId, [...slots]);
        setDirty(false);
        await load();
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setSaving(false);
      }
    },
    [pollId, load]
  );

  const onChange = (next: Set<number>) => {
    setSelected(next);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 900);
  };

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
  if (!data) {
    return (
      <PageContainer>
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  const { poll, members, viewer } = data;
  const heat = buildHeat(poll, members);
  const respondents = new Set(
    (poll.responses || []).map((r) => String(r.memberId))
  ).size;
  const closed = poll.status !== "open";

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        }
        title={poll.title}
        description={
          poll.description ||
          (poll.dateMode === "weekdays"
            ? `${(poll.weekdays ?? []).length} weekday${
                (poll.weekdays ?? []).length === 1 ? "" : "s"
              }, ${poll.meetingMinutes}-minute meeting`
            : `${poll.dates.length} day${
                poll.dates.length === 1 ? "" : "s"
              }, ${poll.meetingMinutes}-minute meeting`)
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={closed ? "muted" : "outline"}>
              {closed
                ? poll.status
                : `Closes ${DateTime.fromISO(poll.deadline).toFormat(
                    "LLL d, h:mm a"
                  )} · ${deadlineCountdown(poll.deadline)}`}
            </Badge>
            {viewer.isManager && (
              <>
                <SharePollButton sharePath={data.sharePath} />
                <Button asChild variant="outline" size="sm">
                  <Link href={resultsHref}>Results</Link>
                </Button>
                <PollManagerMenu
                  poll={poll}
                  onChanged={load}
                  onDeleted={() => router.push(backHref)}
                />
              </>
            )}
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="paint">My availability</TabsTrigger>
            <TabsTrigger value="heatmap">
              Group heatmap
              <span className="ml-1.5 text-xs text-muted-foreground">
                {respondents}/{poll.invitees.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "paint" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving
              </>
            ) : dirty ? (
              <Button size="sm" onClick={() => save(selected)}>
                Save
              </Button>
            ) : (
              <>
                <Check className="size-4 text-primary" /> Saved
              </>
            )}
          </div>
        )}
      </div>

      {closed && tab === "paint" && (
        <p className="text-sm text-muted-foreground">
          This poll is closed, so your grid is read-only now.
        </p>
      )}

      <AvailabilityGrid
        columns={columnsForPoll(poll)}
        accentColor={data.accentColor}
        dayStartMinute={poll.dayStartMinute}
        dayEndMinute={poll.dayEndMinute}
        slotMinutes={poll.slotMinutes}
        mode={tab}
        value={selected}
        onChange={onChange}
        heat={heat}
        respondentCount={respondents}
        disabled={closed}
      />
    </PageContainer>
  );
}
