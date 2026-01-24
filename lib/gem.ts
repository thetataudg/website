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

function getSemesterRangeForTerm(term: "Fall" | "Spring", year: number): SemesterRange {
  if (term === "Spring") {
    return {
      name: buildSemesterName("Spring", year),
      startDate: new Date(year, 0, 1, 0, 0, 0, 0),
      endDate: new Date(year, 5, 30, 23, 59, 59, 999),
    };
  }
  return {
    name: buildSemesterName("Fall", year),
    startDate: new Date(year, 6, 1, 0, 0, 0, 0),
    endDate: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

export function getDefaultSemesterRange(referenceDate = new Date()): SemesterRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  return month < 6
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

  const parseAsUtc = (value: string) => {
    const utc = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(utc.getTime()) ? null : utc;
  };

  if (params.start || params.end) {
    const startDate = params.start ? parseAsUtc(params.start) : defaultRange.startDate;
    const endDate = params.end ? parseAsUtc(params.end) : defaultRange.endDate;
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
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  return month < 6 ? `Spring ${year}` : `Fall ${year}`;
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
