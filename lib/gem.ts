import { DateTime } from "luxon";
import { ARIZONA_ZONE } from "./recurrence";

export const GEM_CATEGORIES = [
  "general-conference",
  "committee-meeting",
  "pillar-brotherhood",
  "pillar-professionalism",
  "pillar-service",
  "rush-event",
  "rush-tabling",
  "fso-event",
  "lock-in",
] as const;

export type GemCategory = (typeof GEM_CATEGORIES)[number];

export const GEM_CATEGORY_LABELS: Record<GemCategory, string> = {
  "general-conference": "General Conference Meeting",
  "committee-meeting": "Committee Meeting",
  "pillar-brotherhood": "Brotherhood Event",
  "pillar-professionalism": "Professionalism Event",
  "pillar-service": "Service Event",
  "rush-event": "Rush Event",
  "rush-tabling": "Rush Tabling",
  "fso-event": "Fulton Student Organization Event",
  "lock-in": "Lock-In",
};

export const GEM_GPA_THRESHOLD = 3.0;

export interface SemesterRange {
  name: string;
  startDate: Date;
  endDate: Date;
}

const SEMESTER_NAME_PATTERN = /^(Spring|Fall)\s+(\d{4})$/i;

function buildSemesterName(term: "Fall" | "Spring", year: number) {
  return `${term} ${year}`;
}

function buildSemesterBoundary(
  year: number,
  month: number,
  day: number,
  boundary: "start" | "end"
) {
  const base = DateTime.fromObject(
    {
      year,
      month,
      day,
      hour: boundary === "start" ? 0 : 23,
      minute: boundary === "start" ? 0 : 59,
      second: boundary === "start" ? 0 : 59,
      millisecond: boundary === "start" ? 0 : 999,
    },
    { zone: ARIZONA_ZONE }
  );
  return base.toJSDate();
}

function parseArizonaDateBoundary(value: string, boundary: "start" | "end") {
  const parsed = DateTime.fromISO(value, { zone: ARIZONA_ZONE });
  if (!parsed.isValid) return null;
  return (boundary === "start" ? parsed.startOf("day") : parsed.endOf("day")).toJSDate();
}

export function formatSemesterDate(date: Date) {
  return DateTime.fromJSDate(date, { zone: ARIZONA_ZONE }).toFormat("yyyy-MM-dd");
}

function getSemesterRangeForTerm(term: "Fall" | "Spring", year: number): SemesterRange {
  if (term === "Spring") {
    return {
      name: buildSemesterName("Spring", year),
      startDate: buildSemesterBoundary(year, 1, 1, "start"),
      endDate: buildSemesterBoundary(year, 7, 31, "end"),
    };
  }
  return {
    name: buildSemesterName("Fall", year),
    startDate: buildSemesterBoundary(year, 8, 1, "start"),
    endDate: buildSemesterBoundary(year, 12, 31, "end"),
  };
}

export function getDefaultSemesterRange(referenceDate = new Date()): SemesterRange {
  const arizonaReference = DateTime.fromJSDate(referenceDate, { zone: ARIZONA_ZONE });
  const year = arizonaReference.year;
  const month = arizonaReference.month;
  return month <= 7
    ? getSemesterRangeForTerm("Spring", year)
    : getSemesterRangeForTerm("Fall", year);
}

export function parseSemesterName(name: string): SemesterRange | null {
  const match = SEMESTER_NAME_PATTERN.exec(name.trim());
  if (!match) return null;
  const [, termRaw, yearRaw] = match;
  const term = termRaw.charAt(0).toUpperCase() + termRaw.slice(1).toLowerCase();
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) return null;
  if (term === "Spring" || term === "Fall") {
    return getSemesterRangeForTerm(term, year);
  }
  return null;
}

export function parseSemesterRange(params: {
  start?: string | null;
  end?: string | null;
  semester?: string | null;
  referenceDate?: Date;
}): SemesterRange {
  const referenceDate = params.referenceDate || new Date();
  const defaultRange = getDefaultSemesterRange(referenceDate);

  if (params.start || params.end) {
    const startDate = params.start
      ? parseArizonaDateBoundary(params.start, "start")
      : defaultRange.startDate;
    const endDate = params.end
      ? parseArizonaDateBoundary(params.end, "end")
      : defaultRange.endDate;
    if (
      startDate &&
      endDate &&
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime())
    ) {
      if (startDate > endDate) {
        return {
          ...defaultRange,
          startDate: endDate,
          endDate: startDate,
        };
      }
      return {
        name: deriveSemesterNameFromDate(startDate),
        startDate,
        endDate,
      };
    }
    return defaultRange;
  }

  if (params.semester) {
    const parsed = parseSemesterName(params.semester);
    if (parsed) return parsed;
  }

  return defaultRange;
}

function deriveSemesterNameFromDate(date: Date): string {
  const arizonaDate = DateTime.fromJSDate(date, { zone: ARIZONA_ZONE });
  return arizonaDate.month <= 7
    ? `Spring ${arizonaDate.year}`
    : `Fall ${arizonaDate.year}`;
}

export function normalizeGemCategory(value?: string | null): GemCategory | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  for (const category of GEM_CATEGORIES) {
    if (category === normalized) {
      return category;
    }
  }
  return null;
}
