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
