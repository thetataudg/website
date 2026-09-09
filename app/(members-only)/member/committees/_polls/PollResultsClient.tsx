"use client";

// The head's view: ranked times from the solver, who each one leaves out, a
// nudge for the people who have not answered, and one-click scheduling with a
// preview of the exact event that gets created.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BellRing, CalendarCheck, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { DateTime } from "luxon";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  fmtSuggestion,
  pollApi,
  type PollDetailResponse,
  type RankedSuggestion,
} from "./pollClient";
import { SharePollButton } from "./SharePollButton";
import { PollManagerMenu } from "./PollManagerMenu";

export default function PollResultsClient({
  pollId,
  backHref,
}: {
  pollId: string;
  backHref: string;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<PollDetailResponse | null>(null);
  const [rows, setRows] = React.useState<RankedSuggestion[]>([]);
  const [inviteeCount, setInviteeCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [reminding, setReminding] = React.useState(false);
  const [chosen, setChosen] = React.useState<RankedSuggestion | null>(null);
  const [location, setLocation] = React.useState("");
  /// For a weekday-mode poll the option is "every Tuesday", so the head picks
  /// which actual date the first meeting is. "YYYY-MM-DDTHH:mm".
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [scheduling, setScheduling] = React.useState(false);
  // Make the created event recurring.
  const [repeat, setRepeat] = React.useState(false);
  const [frequency, setFrequency] = React.useState<
    "daily" | "weekly" | "monthly"
  >("weekly");
  const [interval, setIntervalValue] = React.useState("1");
  const [keepUpcoming, setKeepUpcoming] = React.useState("4");
  const [nudgingId, setNudgingId] = React.useState<string | null>(null);

  /// Who was asked and has not answered by hand, as {id, name}.
  const outstandingPeople = React.useMemo(() => {
    if (!data) return [];
    const answered = new Set(
      (data.poll.responses || [])
        .filter((r) => r.source !== "prefill")
        .map((r) => String(r.memberId))
    );
    const nameById = new Map(data.members.map((m) => [m._id, m.name]));
    return (data.poll.invitees || [])
      .map((i) => String(i.memberId))
      .filter((id) => !answered.has(id))
      .map((id) => ({ id, name: nameById.get(id) || "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const nudgeOne = async (memberId: string, name: string) => {
    setNudgingId(memberId);
    try {
      const r = await pollApi.remind(pollId, [memberId]);
      toast.success(
        r.reminded ? `Nudged ${name}.` : `${name} has hit the reminder limit.`
      );
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setNudgingId(null);
    }
  };

  const load = React.useCallback(async () => {
    try {
      const [detail, sugg] = await Promise.all([
        pollApi.get(pollId),
        pollApi.suggestions(pollId),
      ]);
      setData(detail);
      setRows(sugg.suggestions);
      setInviteeCount(sugg.inviteeCount);
    } catch (e: any) {
      setError(e.message);
    }
  }, [pollId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const remind = async () => {
    setReminding(true);
    try {
      const r = await pollApi.remind(pollId);
      toast.success(
        r.reminded
          ? `Nudged ${r.reminded} ${r.reminded === 1 ? "person" : "people"}.`
          : r.skippedCadence
          ? "Everyone outstanding was already reminded recently."
          : "Nobody left to remind."
      );
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReminding(false);
    }
  };

  const confirmSchedule = async () => {
    if (!chosen || !data) return;
    setScheduling(true);
    try {
      let startISO = chosen.startISO;
      let endISO = chosen.endISO;
      // Weekday mode: turn the picked date + the option's time into an instant.
      if (!chosen.date && scheduleAt) {
        const start = DateTime.fromISO(scheduleAt);
        if (start.isValid) {
          startISO = start.toISO() ?? startISO;
          endISO =
            start.plus({ minutes: data.poll.meetingMinutes }).toISO() ?? endISO;
        }
      }
      const { event } = await pollApi.schedule(pollId, {
        startISO,
        endISO,
        location: location.trim(),
        eventType: "meeting",
        ...(repeat
          ? {
              recurrence: {
                enabled: true,
                frequency,
                interval: Math.max(Number(interval) || 1, 1),
                count: Math.max(Number(keepUpcoming) || 1, 1),
              },
            }
          : {}),
      });
      toast.success("Event created and on the calendar.");
      setChosen(null);
      router.push(`/member/events/${event._id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setScheduling(false);
    }
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

  const { poll } = data;
  const responded = new Set(
    (poll.responses || [])
      .filter((r) => r.source !== "prefill")
      .map((r) => String(r.memberId))
  ).size;
  const outstanding = inviteeCount - responded;
  const scheduled = poll.status === "scheduled";

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
        title={`${poll.title} — results`}
        description={`${responded} of ${inviteeCount} answered${
          outstanding > 0 ? `, ${outstanding} outstanding` : ""
        }.`}
        actions={
          <div className="flex items-center gap-2">
            <SharePollButton sharePath={data.sharePath} />
            {outstanding > 0 && poll.status === "open" && (
            <Button variant="outline" onClick={remind} disabled={reminding}>
              {reminding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BellRing className="size-4" />
              )}
              Remind the {outstanding} who haven&apos;t answered
            </Button>
            )}
            <PollManagerMenu
              poll={poll}
              onChanged={load}
              onDeleted={() => router.push(backHref)}
            />
          </div>
        }
      />

      {scheduled && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm">
            <CalendarCheck className="size-4 text-primary" />
            This poll is scheduled.{" "}
            {poll.scheduledEventId && (
              <Link
                href={`/member/events/${poll.scheduledEventId}`}
                className="font-medium underline"
              >
                Open the event
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {poll.status === "open" && outstandingPeople.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Waiting on {outstandingPeople.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {outstandingPeople.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="text-sm text-foreground">{p.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={nudgingId === p.id}
                    onClick={() => nudgeOne(p.id, p.name)}
                  >
                    {nudgingId === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BellRing className="size-4" />
                    )}
                    Remind
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No times work yet. As people fill in their availability, ranked
            options show up here.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid list-none gap-3 p-0">
          {rows.map((row, i) => (
            <li key={`${row.date || row.weekday}-${row.startMinute}`}>
              <Card className={i === 0 ? "border-primary/50" : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {fmtSuggestion(row, poll.meetingMinutes)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {row.repeatsWeekly && (
                        <Badge variant="muted" className="gap-1">
                          <Repeat className="size-3" />
                          Works weekly
                          {typeof row.weeklyWorstScore === "number"
                            ? ` (min ${row.weeklyWorstScore})`
                            : ""}
                        </Badge>
                      )}
                      <Badge variant={i === 0 ? "default" : "outline"}>
                        {row.score}/{inviteeCount} free
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {row.missing.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Would miss:
                      </span>{" "}
                      {row.missing.map((m) => m.name).join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-primary">Everyone can make it.</p>
                  )}
                  <Button
                    size="sm"
                    disabled={scheduled}
                    onClick={() => {
                      setChosen(row);
                      setLocation("");
                      // Weekday option: default the concrete date to the next
                      // matching one the solver already worked out.
                      setScheduleAt(
                        !row.date && row.startISO
                          ? DateTime.fromISO(row.startISO).toFormat(
                              "yyyy-MM-dd'T'HH:mm"
                            )
                          : ""
                      );
                      // "Every Monday" polls obviously want a weekly series;
                      // a one-off dated poll defaults to a single event.
                      setRepeat(!row.date);
                      setFrequency("weekly");
                      setIntervalValue("1");
                      setKeepUpcoming("4");
                    }}
                  >
                    Schedule this time
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!chosen} onOpenChange={(o) => !o && setChosen(null)}>
        {chosen && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create this event?</DialogTitle>
              <DialogDescription>
                This makes the chapter&apos;s own event, which syncs to Google
                Calendar and everyone&apos;s ICS feed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border p-3">
                <div className="font-medium text-foreground">{poll.title}</div>
                <div className="text-muted-foreground">
                  {fmtSuggestion(chosen, poll.meetingMinutes)}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {chosen.score} of {inviteeCount} available
                  {chosen.missing.length
                    ? `, missing ${chosen.missing
                        .map((m) => m.name)
                        .join(", ")}`
                    : ""}
                </div>
              </div>
              {!chosen.date && (
                <div className="space-y-1.5">
                  <Label htmlFor="poll-when">
                    {repeat ? "First meeting" : "Which date?"}
                  </Label>
                  <DateTimePicker
                    id="poll-when"
                    value={scheduleAt}
                    onChange={setScheduleAt}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="poll-loc">Location (optional)</Label>
                <Input
                  id="poll-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Room, address, or a call name"
                />
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <label className="flex items-center gap-2 font-medium text-foreground">
                  <Checkbox
                    checked={repeat}
                    onCheckedChange={(v) => setRepeat(!!v)}
                  />
                  Repeat this meeting
                </label>
                {repeat && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Frequency</Label>
                      <Select
                        value={frequency}
                        onValueChange={(v) => setFrequency(v as any)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rec-int" className="text-xs">
                        Every
                      </Label>
                      <Input
                        id="rec-int"
                        type="number"
                        min={1}
                        value={interval}
                        onChange={(e) => setIntervalValue(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="rec-keep" className="text-xs">
                        Keep this many upcoming on the calendar
                      </Label>
                      <Input
                        id="rec-keep"
                        type="number"
                        min={1}
                        value={keepUpcoming}
                        onChange={(e) => setKeepUpcoming(e.target.value)}
                      />
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      A rolling window: as each meeting passes, the next one is
                      added. Fine-tune the series later from the event itself.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setChosen(null)}>
                Cancel
              </Button>
              <Button onClick={confirmSchedule} disabled={scheduling}>
                {scheduling && <Loader2 className="size-4 animate-spin" />}
                Create event
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageContainer>
  );
}
