import { DateTime } from "luxon";
import { ARIZONA_ZONE } from "./recurrence";

/// Event categories that GEM counts.
///
/// Grown for the Spring 2026 bylaw change (Article V), which added PNM
/// meetings and PNM-planned events as tracked attendance and split regionals
/// out of the lock-in point so either one earns it.
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
  "regionals",
  "pnm-meeting",
  "pnm-event",
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
  regionals: "Regionals",
  "pnm-meeting": "PNM Meeting",
  "pnm-event": "PNM Planned Event",
};

/// GPA is no longer one of the GEM points — the Spring 2026 bylaw change
/// removed it. The threshold survives because the chapter still records a
/// semester GPA on the same document, it just doesn't score.
export const GEM_GPA_THRESHOLD = 3.0;

// ---------------------------------------------------------------------------
// Article V, Section 1 — the numbers the bylaw fixes
// ---------------------------------------------------------------------------

/// Points needed out of the ten available. Both requirements must also be met;
/// seven points on their own is not GEM.
export const GEM_POINTS_REQUIRED = 7;

/// Fraction of general chapter meetings that must be attended (a requirement,
/// not a point).
export const GEM_GENERAL_MEETING_FRACTION = 1 / 3;

/// The requirement's first path: this many rush events *and* this many tabling
/// slots.
export const GEM_REQUIRED_RUSH_EVENTS = 2;
export const GEM_REQUIRED_RUSH_TABLING = 1;

/// The requirement's second path: this fraction of all PNM meetings.
export const GEM_REQUIREMENT_PNM_FRACTION = 1 / 2;

/// Rush events needed for the rush-attendance *point*, which sits above the
/// two the requirement asks for.
export const GEM_POINT_RUSH_EVENTS = 3;

/// The PNM point's alternative to attending a PNM-planned event.
export const GEM_POINT_PNM_FRACTION = 1 / 3;

/// The two things every member must do. Failing either fails GEM outright,
/// however many points they earned.
export const GEM_REQUIREMENT_KEYS = ["generalMeetings", "rushInvolvement"] as const;
export type GemRequirementKey = (typeof GEM_REQUIREMENT_KEYS)[number];

/// The ten points, in the order Article V lists them.
export const GEM_POINT_KEYS = [
  "committeeMeetings",
  "brotherhood",
  "service",
  "professionalism",
  "rushEvents",
  "rushTabling",
  "fso",
  "lockInOrRegionals",
  "pnm",
  "dues",
] as const;
export type GemPointKey = (typeof GEM_POINT_KEYS)[number];

export type GemCriterionKey = GemRequirementKey | GemPointKey;

export const GEM_POINTS_AVAILABLE = GEM_POINT_KEYS.length;

export const GEM_CRITERION_KEYS: GemCriterionKey[] = [
  ...GEM_REQUIREMENT_KEYS,
  ...GEM_POINT_KEYS,
];

export const GEM_CRITERION_LABELS: Record<GemCriterionKey, string> = {
  generalMeetings: "General chapter meetings",
  rushInvolvement: "Rush involvement",
  committeeMeetings: "Committee meetings",
  brotherhood: "Brotherhood event",
  service: "Service event",
  professionalism: "Professionalism event",
  rushEvents: "Rush events",
  rushTabling: "Assigned rush tabling",
  fso: "Fulton Student Org event",
  lockInOrRegionals: "Lock-in or regionals",
  pnm: "PNM involvement",
  dues: "Dues paid on time",
};

/// What the bylaw asks for, in the bylaw's own words. Shown under each row so
/// nobody has to go find the document to know why a box is unticked.
export const GEM_CRITERION_RULES: Record<GemCriterionKey, string> = {
  generalMeetings: "Attend 1/3 of all general chapter meetings.",
  rushInvolvement:
    "Attend 2 rush events and 1 rush tabling slot, or half of all PNM meetings.",
  committeeMeetings: "Attend a majority (50% + 1) of your committee's meetings.",
  brotherhood: "Attend at least one brotherhood event.",
  service: "Attend at least one service event.",
  professionalism: "Attend at least one professionalism event.",
  rushEvents: "Attend at least 3 rush events.",
  rushTabling: "Attend every rush tabling slot assigned to you.",
  fso: "Attend one Fulton Student Organization event.",
  lockInOrRegionals: "Attend lock-in or attend regionals.",
  pnm: "Attend one PNM-planned event, or 1/3 of PNM meetings.",
  dues: "Pay dues on time, or keep an approved payment plan on time.",
};

/// Where a member sits in the Article V, Section 3 process.
export const GEM_STANDINGS = ["none", "probation", "cooldown"] as const;
export type GemStandingValue = (typeof GEM_STANDINGS)[number];

export const GEM_STANDING_LABELS: Record<GemStandingValue, string> = {
  none: "Good standing",
  probation: "GEM probation",
  cooldown: "Cooldown",
};

export function normalizeGemStanding(value?: string | null): GemStandingValue | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (GEM_STANDINGS as readonly string[]).includes(normalized)
    ? (normalized as GemStandingValue)
    : null;
}

export function normalizeGemCriterionKey(value?: string | null): GemCriterionKey | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim();
  return (GEM_CRITERION_KEYS as readonly string[]).includes(normalized)
    ? (normalized as GemCriterionKey)
    : null;
}

/// How many of `total` are needed to clear `fraction`.
///
/// Rounded up, and never more than the number actually held: a semester with
/// four general meetings needs two, and a semester with one needs one — not
/// "one third of one, rounded up to one, which happens to be all of them" by
/// accident, but by the same rule.
export function neededFor(total: number, fraction: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(total, Math.ceil(total * fraction));
}

/// A majority of a committee's meetings: 50% + 1.
///
/// Two meetings or fewer is treated as automatically met, which is inherited
/// behaviour and deliberate — a committee that met twice all semester has not
/// given anybody a fair chance to build a record.
export function committeeMajorityFor(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.floor(total / 2) + 1;
}

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

/// Which term a date falls in. The inverse of `parseSemesterName`.
///
/// Exported because more than the GEM report needs it now: anything that
/// buckets records by term — committee attendance over several years, for one —
/// has to agree with this file about where August sits, and a second copy of
/// the month arithmetic somewhere else is how two screens end up disagreeing
/// about which term a meeting was in.
export function semesterNameForDate(date: Date): string {
  const arizonaDate = DateTime.fromJSDate(date, { zone: ARIZONA_ZONE });
  return arizonaDate.month <= 7
    ? `Spring ${arizonaDate.year}`
    : `Fall ${arizonaDate.year}`;
}

function deriveSemesterNameFromDate(date: Date): string {
  return semesterNameForDate(date);
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

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/// Attendance the member actually has, by GEM category, for one semester.
export interface GemAttendanceCounts {
  general: number;
  brotherhood: number;
  service: number;
  professionalism: number;
  rushEvent: number;
  rushTabling: number;
  fso: number;
  lockIn: number;
  regionals: number;
  pnmMeeting: number;
  pnmEvent: number;
}

export function emptyGemAttendanceCounts(): GemAttendanceCounts {
  return {
    general: 0,
    brotherhood: 0,
    service: 0,
    professionalism: 0,
    rushEvent: 0,
    rushTabling: 0,
    fso: 0,
    lockIn: 0,
    regionals: 0,
    pnmMeeting: 0,
    pnmEvent: 0,
  };
}

export interface GemCommitteeDetail {
  id: string;
  name: string;
  totalMeetings: number;
  attended: number;
  required: number;
  satisfied: boolean;
}

/// Tabling is the one point that measures a member against their own
/// commitments rather than against the chapter's calendar: the bylaw asks for
/// "all assigned rush tabling slots", and a slot is assigned when the member
/// signed up for it.
export interface GemTablingStanding {
  assigned: number;
  attended: number;
}

/// Article V's dues point, resolved from the ledger before it gets here.
///
/// `pending` is money that isn't late yet — the semester's dues exist and are
/// unpaid, but their due date hasn't passed. It scores the same as `late`
/// today and reads very differently on screen, which is the whole reason it is
/// a separate state.
export type GemDuesState = "on-time" | "late" | "pending" | "none";

export interface GemDuesStanding {
  state: GemDuesState;
  detail: string;
}

/// Chapter-wide denominators. Every member is measured against the same ones.
export interface GemChapterTotals {
  generalTotal: number;
  generalRequired: number;
  pnmMeetingTotal: number;
  pnmRequirementRequired: number;
  pnmPointRequired: number;
}

export function computeGemChapterTotals(input: {
  generalTotal: number;
  pnmMeetingTotal: number;
}): GemChapterTotals {
  return {
    generalTotal: input.generalTotal,
    generalRequired: neededFor(input.generalTotal, GEM_GENERAL_MEETING_FRACTION),
    pnmMeetingTotal: input.pnmMeetingTotal,
    pnmRequirementRequired: neededFor(
      input.pnmMeetingTotal,
      GEM_REQUIREMENT_PNM_FRACTION
    ),
    pnmPointRequired: neededFor(input.pnmMeetingTotal, GEM_POINT_PNM_FRACTION),
  };
}

/// A Section 2 substitution: the chapter voted to let a service to the chapter
/// stand in for a requirement or a point.
export interface GemOverride {
  key: GemCriterionKey;
  granted: boolean;
  note?: string;
}

/// One row on a GEM sheet, requirement or point alike.
export interface GemCriterion {
  key: GemCriterionKey;
  label: string;
  rule: string;
  /// The member's own numbers against that rule.
  detail: string;
  /// Secondary context, when there is any worth carrying.
  hint?: string;
  satisfied: boolean;
  /// True when a Section 2 vote decided this rather than attendance.
  overridden: boolean;
  overrideNote?: string;
}

export interface GemEvaluation {
  requirements: GemCriterion[];
  points: GemCriterion[];
  requirementsMet: boolean;
  pointsEarned: number;
  pointsRequired: number;
  pointsAvailable: number;
  hasCompletedGem: boolean;
}

export interface GemEvaluationInput {
  counts: GemAttendanceCounts;
  committees: GemCommitteeDetail[];
  tabling: GemTablingStanding;
  dues: GemDuesStanding;
  totals: GemChapterTotals;
  overrides?: GemOverride[];
}

/// Article V, Section 1, applied to one member.
///
/// Both requirements *and* seven of the ten points. The two are not
/// interchangeable: a member with all ten points who missed the meeting
/// requirement has still failed GEM, which is the change this bylaw made and
/// the reason requirements are a separate list rather than two more points.
export function evaluateGem(input: GemEvaluationInput): GemEvaluation {
  const { counts, committees, tabling, dues, totals } = input;
  const overrides = new Map<GemCriterionKey, GemOverride>(
    (input.overrides || []).map((entry) => [entry.key, entry])
  );

  const build = (
    key: GemCriterionKey,
    satisfied: boolean,
    detail: string,
    hint?: string
  ): GemCriterion => {
    const override = overrides.get(key);
    return {
      key,
      label: GEM_CRITERION_LABELS[key],
      rule: GEM_CRITERION_RULES[key],
      detail,
      hint,
      satisfied: override ? override.granted : satisfied,
      overridden: Boolean(override),
      overrideNote: override?.note || undefined,
    };
  };

  // --- Requirements -------------------------------------------------------

  // A semester with no general meetings held yet asks nothing of anybody.
  // Scoring that as a failure would put the whole chapter out of GEM in week
  // one, every semester.
  const generalSatisfied =
    totals.generalTotal <= 0 || counts.general >= totals.generalRequired;
  const generalMeetings = build(
    "generalMeetings",
    generalSatisfied,
    totals.generalTotal > 0
      ? `${counts.general} of ${totals.generalRequired} needed`
      : "No general meetings held yet",
    totals.generalTotal > 0 ? `${totals.generalTotal} held this semester` : undefined
  );

  const rushPathMet =
    counts.rushEvent >= GEM_REQUIRED_RUSH_EVENTS &&
    counts.rushTabling >= GEM_REQUIRED_RUSH_TABLING;
  const pnmPathMet =
    totals.pnmMeetingTotal > 0 &&
    counts.pnmMeeting >= totals.pnmRequirementRequired;
  const rushInvolvement = build(
    "rushInvolvement",
    rushPathMet || pnmPathMet,
    `${counts.rushEvent} of ${GEM_REQUIRED_RUSH_EVENTS} rush events · ` +
      `${counts.rushTabling} of ${GEM_REQUIRED_RUSH_TABLING} tabling`,
    totals.pnmMeetingTotal > 0
      ? `Or ${counts.pnmMeeting} of ${totals.pnmRequirementRequired} PNM meetings`
      : "No PNM meetings held yet"
  );

  const requirements = [generalMeetings, rushInvolvement];

  // --- Points -------------------------------------------------------------

  const committeesSatisfied = committees.every((detail) => detail.satisfied);
  const committeesMet = committees.filter((detail) => detail.satisfied).length;
  const committeeMeetings = build(
    "committeeMeetings",
    committees.length > 0 && committeesSatisfied,
    committees.length
      ? `${committeesMet} of ${committees.length} committees satisfied`
      : "No committee assigned",
    committees.length
      ? committees
          .map((detail) => `${detail.name} ${detail.attended}/${detail.required}`)
          .join(" · ")
      : undefined
  );

  const simple = (key: GemPointKey, attended: number) =>
    build(key, attended > 0, `${attended} attended`);

  const rushEvents = build(
    "rushEvents",
    counts.rushEvent >= GEM_POINT_RUSH_EVENTS,
    `${counts.rushEvent} of ${GEM_POINT_RUSH_EVENTS} needed`
  );

  // Vacuously true is the wrong answer here. "All assigned slots" with nothing
  // assigned would hand a free point to every member who signed up for
  // nothing, which is the opposite of what the point is for.
  const rushTabling = build(
    "rushTabling",
    tabling.assigned > 0 && tabling.attended >= tabling.assigned,
    tabling.assigned > 0
      ? `${tabling.attended} of ${tabling.assigned} assigned slots`
      : "No tabling slots signed up for",
    tabling.assigned > 0 ? undefined : "Sign up for a slot to earn this point"
  );

  const lockInOrRegionals = build(
    "lockInOrRegionals",
    counts.lockIn > 0 || counts.regionals > 0,
    counts.lockIn > 0 || counts.regionals > 0
      ? `Lock-in ${counts.lockIn} · Regionals ${counts.regionals}`
      : "Neither attended"
  );

  const pnmPointByMeetings =
    totals.pnmMeetingTotal > 0 && counts.pnmMeeting >= totals.pnmPointRequired;
  const pnm = build(
    "pnm",
    counts.pnmEvent > 0 || pnmPointByMeetings,
    counts.pnmEvent > 0
      ? `${counts.pnmEvent} PNM event${counts.pnmEvent === 1 ? "" : "s"} attended`
      : totals.pnmMeetingTotal > 0
        ? `${counts.pnmMeeting} of ${totals.pnmPointRequired} PNM meetings`
        : "No PNM events or meetings yet",
    counts.pnmEvent > 0 && totals.pnmMeetingTotal > 0
      ? `PNM meetings: ${counts.pnmMeeting} of ${totals.pnmMeetingTotal}`
      : undefined
  );

  const duesPoint = build("dues", dues.state === "on-time", dues.detail);

  const points = [
    committeeMeetings,
    simple("brotherhood", counts.brotherhood),
    simple("service", counts.service),
    simple("professionalism", counts.professionalism),
    rushEvents,
    rushTabling,
    simple("fso", counts.fso),
    lockInOrRegionals,
    pnm,
    duesPoint,
  ];

  const requirementsMet = requirements.every((row) => row.satisfied);
  const pointsEarned = points.filter((row) => row.satisfied).length;

  return {
    requirements,
    points,
    requirementsMet,
    pointsEarned,
    pointsRequired: GEM_POINTS_REQUIRED,
    pointsAvailable: GEM_POINTS_AVAILABLE,
    hasCompletedGem: requirementsMet && pointsEarned >= GEM_POINTS_REQUIRED,
  };
}
