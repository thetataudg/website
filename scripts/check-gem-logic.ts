import {
  GEM_POINTS_AVAILABLE,
  GEM_POINTS_REQUIRED,
  GemAttendanceCounts,
  GemCommitteeDetail,
  GemCriterionKey,
  GemOverride,
  committeeMajorityFor,
  computeGemChapterTotals,
  emptyGemAttendanceCounts,
  evaluateGem,
  neededFor,
  normalizeGemCategory,
  normalizeGemCriterionKey,
  normalizeGemStanding,
} from "@/lib/gem";

let pass = 0,
  fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}${
      ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
    }`
  );
  ok ? pass++ : fail++;
}

console.log("\nfractions the bylaw fixes");
check("a third of 9 is 3", neededFor(9, 1 / 3), 3);
check("a third of 10 rounds up to 4", neededFor(10, 1 / 3), 4);
check("a third of 1 is 1", neededFor(1, 1 / 3), 1);
check("nothing held asks for nothing", neededFor(0, 1 / 3), 0);
check("half of 7 rounds up to 4", neededFor(7, 1 / 2), 4);
check("never more than were held", neededFor(2, 1 / 3), 1);

console.log("\ncommittee majority is 50% + 1");
check("of 4 meetings, 3", committeeMajorityFor(4), 3);
check("of 5 meetings, 3", committeeMajorityFor(5), 3);
check("of 6 meetings, 4", committeeMajorityFor(6), 4);

console.log("\nthe new categories are accepted");
check("regionals", normalizeGemCategory("regionals"), "regionals");
check("pnm-meeting", normalizeGemCategory("PNM-Meeting"), "pnm-meeting");
check("pnm-event", normalizeGemCategory(" pnm-event "), "pnm-event");
check("nonsense is rejected", normalizeGemCategory("gpa"), null);
check("a criterion key round-trips", normalizeGemCriterionKey("rushTabling"), "rushTabling");
check("gpa is no longer a criterion", normalizeGemCriterionKey("gpa"), null);
check("standing normalizes", normalizeGemStanding("Probation"), "probation");

console.log("\nthe shape of the sheet");
const totals = computeGemChapterTotals({ generalTotal: 12, pnmMeetingTotal: 6 });
check("a third of 12 general meetings", totals.generalRequired, 4);
check("half of 6 PNM meetings for the requirement", totals.pnmRequirementRequired, 3);
check("a third of 6 PNM meetings for the point", totals.pnmPointRequired, 2);
check("ten points available", GEM_POINTS_AVAILABLE, 10);
check("seven needed", GEM_POINTS_REQUIRED, 7);

function counts(overrides: Partial<GemAttendanceCounts> = {}): GemAttendanceCounts {
  return { ...emptyGemAttendanceCounts(), ...overrides };
}

function committee(attended: number, total = 4): GemCommitteeDetail {
  const required = total <= 2 ? total : committeeMajorityFor(total);
  return {
    id: "c1",
    name: "Service",
    totalMeetings: total,
    attended,
    required,
    satisfied: total <= 2 ? true : attended >= required,
  };
}

/// A member who does everything. Used as the baseline every case below bends
/// one thing away from, so a failure names exactly the rule that broke.
function perfect(extra: Partial<GemAttendanceCounts> = {}) {
  return evaluateGem({
    counts: counts({
      general: 4,
      brotherhood: 1,
      service: 1,
      professionalism: 1,
      rushEvent: 3,
      rushTabling: 2,
      fso: 1,
      lockIn: 1,
      pnmMeeting: 3,
      pnmEvent: 1,
      ...extra,
    }),
    committees: [committee(3)],
    tabling: { assigned: 2, attended: 2 },
    dues: { state: "on-time", detail: "Dues paid on time" },
    totals,
  });
}

console.log("\nthe complete member");
const all = perfect();
check("earns every point", all.pointsEarned, 10);
check("meets both requirements", all.requirementsMet, true);
check("makes GEM", all.hasCompletedGem, true);
check("two requirements listed", all.requirements.length, 2);
check("ten points listed", all.points.length, 10);

console.log("\nrequirements are not points");
// Ten points and a missed meeting requirement is still a failure. This is the
// whole change the bylaw made, and the one thing most likely to regress.
const missedMeetings = evaluateGem({
  counts: counts({
    general: 1,
    brotherhood: 1,
    service: 1,
    professionalism: 1,
    rushEvent: 3,
    rushTabling: 2,
    fso: 1,
    lockIn: 1,
    pnmMeeting: 3,
    pnmEvent: 1,
  }),
  committees: [committee(3)],
  tabling: { assigned: 2, attended: 2 },
  dues: { state: "on-time", detail: "" },
  totals,
});
check("still earns ten points", missedMeetings.pointsEarned, 10);
check("but fails the requirement", missedMeetings.requirementsMet, false);
check("so fails GEM", missedMeetings.hasCompletedGem, false);

console.log("\nweek one asks nothing");
const emptySemester = evaluateGem({
  counts: counts(),
  committees: [],
  tabling: { assigned: 0, attended: 0 },
  dues: { state: "none", detail: "" },
  totals: computeGemChapterTotals({ generalTotal: 0, pnmMeetingTotal: 0 }),
});
check("no meetings held -> requirement met", emptySemester.requirements[0].satisfied, true);
check("but rush involvement is not free", emptySemester.requirements[1].satisfied, false);
check("and no points are earned", emptySemester.pointsEarned, 0);

console.log("\nthe rush requirement's two paths");
function rushRequirement(input: Partial<GemAttendanceCounts>) {
  return evaluateGem({
    counts: counts(input),
    committees: [],
    tabling: { assigned: 0, attended: 0 },
    dues: { state: "none", detail: "" },
    totals,
  }).requirements[1].satisfied;
}
check("2 events + 1 tabling", rushRequirement({ rushEvent: 2, rushTabling: 1 }), true);
check("2 events, no tabling", rushRequirement({ rushEvent: 2, rushTabling: 0 }), false);
check("1 event + 1 tabling", rushRequirement({ rushEvent: 1, rushTabling: 1 }), false);
check("half the PNM meetings alone", rushRequirement({ pnmMeeting: 3 }), true);
check("just under half the PNM meetings", rushRequirement({ pnmMeeting: 2 }), false);

console.log("\nthe rush point sits above the requirement");
function point(key: GemCriterionKey, evaluation = perfect()) {
  return evaluation.points.find((row) => row.key === key)?.satisfied;
}
check("3 events earns it", point("rushEvents"), true);
check(
  "2 events does not",
  point("rushEvents", perfect({ rushEvent: 2 })),
  false
);

console.log("\ntabling is measured against what you signed up for");
function tabling(assigned: number, attended: number) {
  return evaluateGem({
    counts: counts({ rushTabling: attended }),
    committees: [],
    tabling: { assigned, attended },
    dues: { state: "none", detail: "" },
    totals,
  }).points.find((row) => row.key === "rushTabling")?.satisfied;
}
check("turned up to both slots", tabling(2, 2), true);
check("missed one", tabling(2, 1), false);
// Vacuously true would hand a free point to everyone who signed up for
// nothing, which is the opposite of what the point rewards.
check("signed up for none earns nothing", tabling(0, 0), false);

console.log("\nlock-in or regionals, either one");
check("lock-in alone", point("lockInOrRegionals", perfect({ lockIn: 1, regionals: 0 })), true);
check("regionals alone", point("lockInOrRegionals", perfect({ lockIn: 0, regionals: 1 })), true);
check("neither", point("lockInOrRegionals", perfect({ lockIn: 0, regionals: 0 })), false);

console.log("\nthe PNM point, either way");
check("a planned event", point("pnm", perfect({ pnmEvent: 1, pnmMeeting: 0 })), true);
check("a third of the meetings", point("pnm", perfect({ pnmEvent: 0, pnmMeeting: 2 })), true);
check("one meeting short", point("pnm", perfect({ pnmEvent: 0, pnmMeeting: 1 })), false);

console.log("\nthe dues point follows the ledger's verdict");
function dues(state: "on-time" | "late" | "pending" | "none") {
  return evaluateGem({
    counts: counts(),
    committees: [],
    tabling: { assigned: 0, attended: 0 },
    dues: { state, detail: "" },
    totals,
  }).points.find((row) => row.key === "dues")?.satisfied;
}
check("on time earns it", dues("on-time"), true);
check("late does not", dues("late"), false);
check("not yet due does not, yet", dues("pending"), false);
check("nothing billed does not", dues("none"), false);

console.log("\ncommittee membership");
function committeePoint(details: GemCommitteeDetail[]) {
  return evaluateGem({
    counts: counts(),
    committees: details,
    tabling: { assigned: 0, attended: 0 },
    dues: { state: "none", detail: "" },
    totals,
  }).points.find((row) => row.key === "committeeMeetings")?.satisfied;
}
check("a majority of four meetings", committeePoint([committee(3)]), true);
check("two of four is not a majority", committeePoint([committee(2)]), false);
check("a committee that met twice is auto-met", committeePoint([committee(0, 2)]), true);
// No committee means no committee attendance to point at, so nothing to award.
check("no committee at all earns nothing", committeePoint([]), false);
check(
  "every committee must be satisfied",
  committeePoint([committee(3), { ...committee(1), id: "c2", name: "Rush" }]),
  false
);

console.log("\nSection 2 substitutions");
function withOverride(overrides: GemOverride[]) {
  return evaluateGem({
    counts: counts(),
    committees: [],
    tabling: { assigned: 0, attended: 0 },
    dues: { state: "none", detail: "" },
    totals,
    overrides,
  });
}
const granted = withOverride([
  { key: "generalMeetings", granted: true, note: "Ran the fall retreat" },
]);
check("a granted requirement is satisfied", granted.requirements[0].satisfied, true);
check("and is marked as a chapter vote", granted.requirements[0].overridden, true);
check("carrying its documentation", granted.requirements[0].overrideNote, "Ran the fall retreat");
const revoked = evaluateGem({
  counts: counts({ brotherhood: 3 }),
  committees: [],
  tabling: { assigned: 0, attended: 0 },
  dues: { state: "none", detail: "" },
  totals,
  overrides: [{ key: "brotherhood", granted: false }],
});
// False is meaningful, not merely absent: the same vote can take a point away.
check(
  "a denied point overrides attendance",
  revoked.points.find((row) => row.key === "brotherhood")?.satisfied,
  false
);
check("the detail still shows the attendance", revoked.points.find((row) => row.key === "brotherhood")?.detail, "3 attended");

console.log("\nthe seven-point line");
function pointsFor(n: number) {
  const keys: GemCriterionKey[] = [
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
  ];
  return evaluateGem({
    counts: counts(),
    committees: [],
    tabling: { assigned: 0, attended: 0 },
    dues: { state: "none", detail: "" },
    totals: computeGemChapterTotals({ generalTotal: 0, pnmMeetingTotal: 0 }),
    overrides: [
      { key: "rushInvolvement", granted: true },
      ...keys.slice(0, n).map((key) => ({ key, granted: true })),
    ],
  });
}
check("six points is not enough", pointsFor(6).hasCompletedGem, false);
check("seven points makes GEM", pointsFor(7).hasCompletedGem, true);
check("and the count is reported", pointsFor(7).pointsEarned, 7);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
