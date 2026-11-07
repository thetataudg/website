// lib/tasks/ics.ts
// A member's open, dated tasks as VEVENT blocks for their calendar feed.
//
// VEVENT, not VTODO: Apple Calendar ignores VTODO in subscriptions. UIDs are
// `task-<id>@ttdg.org` so they never collide with event UIDs.
import { DateTime } from "luxon";
import { escapeText, fold, formatUTC } from "@/lib/calendarFeed";
import { TASK_ZONE } from "./constants";

export interface IcsTask {
  id: string;
  key: string;
  title: string;
  dueAt: Date | string;
  dueAllDay: boolean;
  url: string;
  updatedAt?: Date | string | null;
}

const ymd = (dt: DateTime) => dt.toFormat("yyyyLLdd");

export function taskEventBlock(task: IcsTask): string[] {
  const due = DateTime.fromJSDate(new Date(task.dueAt)).setZone(TASK_ZONE);
  const lines = [
    "BEGIN:VEVENT",
    `UID:task-${task.id}@ttdg.org`,
    `DTSTAMP:${formatUTC(new Date(task.updatedAt ?? Date.now()))}`,
  ];
  if (task.dueAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${ymd(due)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(due.plus({ days: 1 }))}`);
    lines.push("TRANSP:TRANSPARENT");
  } else {
    lines.push(`DTSTART:${formatUTC(due.toJSDate())}`);
    lines.push(`DTEND:${formatUTC(due.plus({ minutes: 30 }).toJSDate())}`);
  }
  lines.push(fold(`SUMMARY:${escapeText(`[${task.key}] ${task.title}`)}`));
  lines.push(fold(`DESCRIPTION:${escapeText(task.url)}`));
  lines.push(fold(`URL:${task.url}`));
  lines.push("CATEGORIES:TASK");
  // One reminder at 9am Phoenix on the due day.
  const alarm = due.startOf("day").set({ hour: 9 });
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${escapeText(`${task.key} is due today`)}`),
    `TRIGGER;VALUE=DATE-TIME:${formatUTC(alarm.toJSDate())}`,
    "END:VALARM",
    "END:VEVENT"
  );
  return lines;
}
