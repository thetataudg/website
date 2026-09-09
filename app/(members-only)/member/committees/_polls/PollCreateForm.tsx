"use client";

// The create-a-poll form body. Rendered inside a wide modal on a committee
// dashboard, and as a page for a chapter-wide poll. All date/time inputs are
// the project's shadcn components, never the browser's native pickers.
import * as React from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DateTime } from "luxon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { toYmd } from "@/components/ui/date-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { pollApi } from "./pollClient";

const WEEKDAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

/** "6:00 AM" … "11:30 PM" in 30-minute steps, as {value:"HH:mm", label}. */
const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const minute = 6 * 60 + i * 30;
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    label: `${h12}:${String(m).padStart(2, "0")} ${ampm}`,
  };
});

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default function PollCreateForm({
  committeeId,
  committeeName,
  onDone,
  onCancel,
}: {
  committeeId: string | null;
  committeeName?: string;
  onDone: (poll: { _id: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(committeeName ?? "");
  const [title, setTitle] = React.useState(
    committeeId && committeeName ? `${committeeName} meeting` : ""
  );
  const titleTouched = React.useRef(false);
  const [description, setDescription] = React.useState("");

  const [mode, setMode] = React.useState<"dates" | "weekdays">("dates");
  const [dates, setDates] = React.useState<Date[]>([]);
  const [weekdays, setWeekdays] = React.useState<Set<number>>(new Set());

  const [startTime, setStartTime] = React.useState("17:00");
  const [endTime, setEndTime] = React.useState("21:00");
  const [slotMinutes, setSlotMinutes] = React.useState("30");
  const [meetingMinutes, setMeetingMinutes] = React.useState("60");
  const [deadline, setDeadline] = React.useState(
    DateTime.now().plus({ days: 3 }).set({ minute: 0, second: 0 }).toFormat(
      "yyyy-MM-dd'T'HH:mm"
    )
  );
  const [cadenceHours, setCadenceHours] = React.useState("24");
  const [maxReminders, setMaxReminders] = React.useState("5");
  const [finalCallHours, setFinalCallHours] = React.useState("24");
  const [escalateToHead, setEscalateToHead] = React.useState(true);

  const [roster, setRoster] = React.useState<Array<{ _id: string; name: string }>>(
    []
  );
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!committeeId) return;
    fetch(`/api/committees/${committeeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        setName(c.name || "");
        if (!titleTouched.current) setTitle(`${c.name || "Committee"} meeting`);
        const rows: Array<{ _id: string; name: string }> = [];
        const push = (m: any) => {
          if (!m || typeof m === "string") return;
          rows.push({
            _id: String(m._id),
            name:
              `${m.fName ?? ""} ${m.lName ?? ""}`.trim() || m.rollNo || "Member",
          });
        };
        push(c.committeeHeadId);
        (c.committeeMembers || []).forEach(push);
        const seen = new Set<string>();
        setRoster(rows.filter((r) => !seen.has(r._id) && seen.add(r._id)));
      })
      .catch(() => undefined);
  }, [committeeId]);

  const toggleWeekday = (n: number) =>
    setWeekdays((cur) => {
      const next = new Set(cur);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  const addWeekdayHorizon = () => {
    const out: Date[] = [];
    let cur = DateTime.now().startOf("day").plus({ days: 1 });
    while (out.length < 10) {
      if (cur.weekday <= 5) out.push(cur.toJSDate());
      cur = cur.plus({ days: 1 });
    }
    setDates((d) => {
      const keys = new Set(d.map(toYmd));
      return [...d, ...out.filter((x) => !keys.has(toYmd(x)))].sort(
        (a, b) => a.getTime() - b.getTime()
      );
    });
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Give the poll a title.");
    if (mode === "dates" && dates.length === 0)
      return toast.error("Pick at least one date.");
    if (mode === "weekdays" && weekdays.size === 0)
      return toast.error("Pick at least one day of the week.");
    if (toMinutes(endTime) <= toMinutes(startTime))
      return toast.error("The daily window ends before it starts.");

    setSubmitting(true);
    try {
      const poll = await pollApi.create({
        title: title.trim(),
        description: description.trim(),
        committeeId,
        dateMode: mode,
        dates: mode === "dates" ? dates.map(toYmd) : [],
        weekdays: mode === "weekdays" ? [...weekdays].sort((a, b) => a - b) : [],
        dayStartMinute: toMinutes(startTime),
        dayEndMinute: toMinutes(endTime),
        slotMinutes: Number(slotMinutes),
        meetingMinutes: Number(meetingMinutes),
        deadline: new Date(deadline).toISOString(),
        reminder: {
          cadenceHours: Number(cadenceHours),
          maxReminders: Number(maxReminders),
          finalCallHours: Number(finalCallHours),
          escalateToHead,
        },
        inviteeIds: roster.filter((r) => !excluded.has(r._id)).map((r) => r._id),
      });
      toast.success("Poll opened. Everyone was just asked.");
      onDone(poll);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {committeeId
          ? `Asks the ${name || "committee"} roster.`
          : "Asks every active member."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-title">Title</Label>
          <Input
            id="p-title"
            value={title}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-desc">Description (optional)</Label>
          <Textarea
            id="p-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {/* mode */}
      <div className="space-y-3">
        <div>
          <Label className="mb-1.5 block">What might work?</Label>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-input bg-muted/40 p-1">
            {(["dates", "weekdays"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "dates" ? "Specific dates" : "Days of the week"}
              </button>
            ))}
          </div>
        </div>

        {mode === "dates" ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="relative flex justify-center">
              <Calendar
                className="relative"
                mode="multiple"
                selected={dates}
                onSelect={(next) => setDates(next ?? [])}
                disabled={{ before: new Date() }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">
                {dates.length
                  ? `${dates.length} date${dates.length === 1 ? "" : "s"} selected`
                  : "Pick one or more dates"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addWeekdayHorizon}
              >
                + next 2 weeks of weekdays
              </Button>
            </div>
            {dates.length > 0 && (
              <ul className="flex list-none flex-wrap gap-1.5 p-0">
                {[...dates]
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d) => (
                    <li key={toYmd(d)}>
                      <Badge variant="muted" className="gap-1">
                        {DateTime.fromJSDate(d).toFormat("EEE LLL d")}
                        <button
                          type="button"
                          aria-label="Remove date"
                          onClick={() =>
                            setDates((cur) =>
                              cur.filter((x) => toYmd(x) !== toYmd(d))
                            )
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w) => {
                const on = weekdays.has(w.n);
                return (
                  <button
                    key={w.n}
                    type="button"
                    onClick={() => toggleWeekday(w.n)}
                    className={cn(
                      "rounded-md border py-2 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              A standing slot with no date. Options come back as &ldquo;every
              Tuesday at 5&rdquo;, and you pick the first meeting&apos;s date
              when you schedule it.
            </p>
          </div>
        )}
      </div>

      {/* window */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Earliest</Label>
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Latest</Label>
          <Select value={endTime} onValueChange={setEndTime}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Slot size</Label>
          <Select value={slotMinutes} onValueChange={setSlotMinutes}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">60 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-len">Meeting length</Label>
          <Input
            id="p-len"
            type="number"
            min={15}
            step={15}
            value={meetingMinutes}
            onChange={(e) => setMeetingMinutes(e.target.value)}
          />
        </div>
      </div>

      {/* deadline + reminders */}
      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-deadline">Poll closes</Label>
          <DateTimePicker
            id="p-deadline"
            value={deadline}
            onChange={setDeadline}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-cad">Remind every (h)</Label>
            <Input
              id="p-cad"
              type="number"
              min={1}
              value={cadenceHours}
              onChange={(e) => setCadenceHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-max">Max reminders</Label>
            <Input
              id="p-max"
              type="number"
              min={1}
              value={maxReminders}
              onChange={(e) => setMaxReminders(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-fc">Final call within (h)</Label>
            <Input
              id="p-fc"
              type="number"
              min={1}
              value={finalCallHours}
              onChange={(e) => setFinalCallHours(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={escalateToHead}
            onCheckedChange={(v) => setEscalateToHead(!!v)}
          />
          Send me a digest of who is still outstanding
        </label>
      </div>

      {roster.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label>Who gets asked ({roster.length - excluded.size})</Label>
          <ul className="grid list-none gap-1.5 p-0 sm:grid-cols-2">
            {roster.map((m) => (
              <li key={m._id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!excluded.has(m._id)}
                    onCheckedChange={(v) =>
                      setExcluded((cur) => {
                        const next = new Set(cur);
                        v ? next.delete(m._id) : next.add(m._id);
                        return next;
                      })
                    }
                  />
                  {m.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Open poll
        </Button>
      </div>
    </div>
  );
}
