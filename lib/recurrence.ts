import { DateTime } from "luxon";

export const ARIZONA_ZONE = "America/Phoenix";

export type RecurrenceConfig = {
  frequency?: "daily" | "weekly" | "monthly";
  interval?: number;
  endDate?: Date | null;
};

export function toArizonaDateTime(value?: Date | string | null) {
  if (!value) return null;
  const jsDate = typeof value === "string" ? new Date(value) : value;
  if (!(jsDate instanceof Date) || Number.isNaN(jsDate.getTime())) {
    return null;
  }
  const dt = DateTime.fromJSDate(jsDate, { zone: ARIZONA_ZONE });
  return dt.isValid ? dt : null;
}

export function toArizonaInputValue(value: string | Date) {
  if (value === undefined || value === null) return "";
  const parsed =
    typeof value === "string"
      ? DateTime.fromISO(value)
      : DateTime.fromJSDate(new Date(value), { zone: ARIZONA_ZONE });
  if (!parsed.isValid) return "";
  return parsed.setZone(ARIZONA_ZONE).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function toArizonaIso(value: string) {
  if (!value) return value;
  const parsed = DateTime.fromISO(value, { zone: ARIZONA_ZONE });
  if (!parsed.isValid) return value;
  return parsed.toUTC().toISO();
}

export function getArizonaNow() {
  return DateTime.now().setZone(ARIZONA_ZONE);
}

export function addRecurrence(
  startTime: Date,
  endTime: Date,
  config: RecurrenceConfig
) {
  const baseStart = toArizonaDateTime(startTime);
  const baseEnd = toArizonaDateTime(endTime);
  if (!baseStart || !baseEnd) return null;
  const frequency = config.frequency || "weekly";
  const interval = Math.max(Number(config.interval) || 1, 1);

  let nextStart = baseStart;
  if (frequency === "daily") {
    nextStart = nextStart.plus({ days: interval });
  } else if (frequency === "monthly") {
    nextStart = nextStart.plus({ months: interval });
  } else {
    nextStart = nextStart.plus({ weeks: interval });
  }

  if (!nextStart.isValid) {
    return null;
  }

  const durationMs = baseEnd.diff(baseStart).as("milliseconds");
  const nextEnd = nextStart.plus({ milliseconds: durationMs });

  const effectiveEndDate = config.endDate ? toArizonaDateTime(config.endDate) : null;
  if (effectiveEndDate && nextStart > effectiveEndDate) {
    return null;
  }

  return { startTime: nextStart.toJSDate(), endTime: nextEnd.toJSDate() };
}

export function applyTimeOfDay(targetDate: Date, baseTime: Date) {
  const target = toArizonaDateTime(targetDate);
  const base = toArizonaDateTime(baseTime);
  if (!target || !base) {
    return targetDate;
  }
  const adjusted = target.set({
    hour: base.hour,
    minute: base.minute,
    second: base.second,
    millisecond: base.millisecond,
  });
  return adjusted.toJSDate();
}

/// Safety caps on how much a single recurring series may generate.
///
/// A series is now materialised in full the moment it is saved, so the end date
/// is the only thing standing between a typo ("2206" for "2026", or a daily
/// event with no sensible stop) and thousands of rows plus one Google Calendar
/// call per row. A year covers any real semester or academic-year schedule, and
/// 200 occurrences covers a daily event for most of that year and a weekly one
/// for several. Past either cap the request is refused with a message rather
/// than silently truncated, because a series that quietly stops in March is
/// worse than one that tells the officer why it would not save.
export const MAX_RECURRENCE_OCCURRENCES = 200;
export const MAX_RECURRENCE_SPAN_DAYS = 366;

/**
 * Turns whatever a client sent for "repeat until" into the last instant an
 * occurrence may start.
 *
 * The date picker sends a bare calendar day ("2026-12-01"). Parsed as a
 * plain `Date` that is midnight UTC, which in Arizona is 5pm the evening
 * *before*, so a 6pm meeting on the chosen last day was excluded from its own
 * series. A day means the whole day, in the chapter's time zone.
 */
export function normalizeRecurrenceEndDate(
  value?: Date | string | null
): Date | null {
  if (!value) return null;
  let parsed: DateTime;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    parsed = DateTime.fromISO(value.trim(), { zone: ARIZONA_ZONE });
  } else {
    const asDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(asDate.getTime())) return null;
    parsed = DateTime.fromJSDate(asDate, { zone: ARIZONA_ZONE });
  }
  if (!parsed.isValid) return null;
  return parsed.endOf("day").toJSDate();
}

/// The nth step (n >= 1) of a series from its first occurrence.
///
/// Always counted from the first occurrence rather than chained from the
/// previous one: stepping a monthly event from Jan 31 one month at a time goes
/// Feb 28, Mar 28 and never recovers the 31st, where Jan 31 + 2 months is
/// Mar 31.
function stepFromStart(
  baseStart: DateTime,
  frequency: string,
  interval: number,
  n: number
) {
  const amount = interval * n;
  if (frequency === "daily") return baseStart.plus({ days: amount });
  if (frequency === "monthly") return baseStart.plus({ months: amount });
  return baseStart.plus({ weeks: amount });
}

/**
 * Every occurrence of a series *after* the first, up to and including its end
 * date. Stops early at `limit` so a caller can detect "too many" without
 * generating them all.
 */
export function listRecurrenceOccurrences(
  startTime: Date,
  endTime: Date,
  config: RecurrenceConfig,
  limit = MAX_RECURRENCE_OCCURRENCES + 1
) {
  const baseStart = toArizonaDateTime(startTime);
  const baseEnd = toArizonaDateTime(endTime);
  const until = config.endDate ? toArizonaDateTime(config.endDate) : null;
  if (!baseStart || !baseEnd || !until) return [];

  const frequency = config.frequency || "weekly";
  const interval = Math.max(Number(config.interval) || 1, 1);
  const durationMs = baseEnd.diff(baseStart).as("milliseconds");

  const out: { startTime: Date; endTime: Date }[] = [];
  for (let n = 1; n <= limit; n += 1) {
    const next = stepFromStart(baseStart, frequency, interval, n);
    if (!next.isValid || next > until) break;
    out.push({
      startTime: next.toJSDate(),
      endTime: next.plus({ milliseconds: durationMs }).toJSDate(),
    });
  }
  return out;
}

/// The Arizona calendar day an occurrence falls on, which is how a series is
/// matched against the rows it already has. Matching on the exact instant
/// breaks the first time an officer shifts a series' start time.
export function occurrenceDayKey(value: Date | string) {
  return toArizonaDateTime(value as any)?.toFormat("yyyy-MM-dd") ?? "";
}
