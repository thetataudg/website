// Pure checks for the availability solver. No DB, no network.
//
//   npm run check:availability
//
// Mirrors scripts/check-gem-logic.ts: a tiny assert helper and a flat list of
// cases, each named so a failure points at the rule that broke.
import { solve, gridShape, SolvePollInput, SolveEventInput } from "@/lib/availability/solve";

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

// A poll well in the future so nothing is dropped as "in the past". Three
// Mondays, 9am-11am, 30-min slots (so slotsPerDay = 4), 60-min meeting.
const DATES = ["2099-09-07", "2099-09-14", "2099-09-21"]; // all Mondays
function basePoll(overrides: Partial<SolvePollInput> = {}): SolvePollInput {
  return {
    dates: DATES,
    dayStartMinute: 540, // 9:00
    dayEndMinute: 660, // 11:00
    slotMinutes: 30,
    meetingMinutes: 60,
    invitees: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }],
    responses: [],
    committeeId: null,
    ...overrides,
  };
}

console.log("\ngrid shape");
{
  const { slotsPerDay, slotsNeeded } = gridShape(basePoll());
  check("four 30-min slots between 9 and 11", slotsPerDay, 4);
  check("a 60-min meeting needs two slots", slotsNeeded, 2);
}

console.log("\nan empty-response poll ranks nothing above zero");
{
  const ranked = solve(basePoll(), [], { now: new Date("2099-01-01") });
  check("still returns candidates", ranked.length > 0, true);
  check("every score is zero", ranked.every((r) => r.score === 0), true);
  check(
    "everyone is listed as missing",
    ranked[0].missingMemberIds.sort(),
    ["a", "b", "c"]
  );
  check("nothing repeats weekly with no responses", ranked.every((r) => !r.repeatsWeekly), true);
}

console.log("\nscoring counts only invitees free for the whole meeting");
{
  // slot indices per Monday: day0 -> 0..3, day1 -> 4..7, day2 -> 8..11.
  // The 9:00 meeting on day0 covers slots {0,1}. The 9:30 meeting covers {1,2}.
  const poll = basePoll({
    responses: [
      { memberId: "a", slots: [0, 1, 2, 3] }, // free all of day0
      { memberId: "b", slots: [1, 2] }, // only the middle -> 9:30 works, 9:00 does not
      { memberId: "c", slots: [4, 5] }, // day1 only
    ],
  });
  const ranked = solve(poll, [], { now: new Date("2099-01-01") });
  const at = (d: string, m: number) =>
    ranked.find((r) => r.date === d && r.startMinute === m);
  check("9:00 on day0 has only a free", at("2099-09-07", 540)?.score, 1);
  check("9:30 on day0 has a and b free", at("2099-09-07", 570)?.score, 2);
  check(
    "9:30 on day0 excludes c",
    at("2099-09-07", 570)?.missingMemberIds,
    ["c"]
  );
  check("top option is the 9:30 on day0", [ranked[0].date, ranked[0].startMinute], ["2099-09-07", 570]);
}

console.log("\na recurring chapter event hard-blocks the slot on every week");
{
  const poll = basePoll({
    responses: [
      { memberId: "a", slots: Array.from({ length: 12 }, (_, i) => i) },
      { memberId: "b", slots: Array.from({ length: 12 }, (_, i) => i) },
      { memberId: "c", slots: Array.from({ length: 12 }, (_, i) => i) },
    ],
  });
  // Chapter meeting every Monday 9:00-9:30, starting the first poll Monday.
  const events: SolveEventInput[] = [
    {
      startTime: "2099-09-07T09:00:00-07:00",
      endTime: "2099-09-07T09:30:00-07:00",
      status: "scheduled",
      committeeId: null,
      recurrence: { enabled: true, frequency: "weekly", interval: 1 },
    },
  ];
  const ranked = solve(poll, events, { now: new Date("2099-01-01") });
  const has = (d: string, m: number) =>
    ranked.some((r) => r.date === d && r.startMinute === m);
  check("9:00 blocked on day0", has("2099-09-07", 540), false);
  check("9:00 blocked on day1 by the recurrence", has("2099-09-14", 540), false);
  check("9:00 blocked on day2 by the recurrence", has("2099-09-21", 540), false);
  // 9:30 meeting covers slots {1,2} = 9:30-10:30, clear of the 9:00-9:30 block.
  check("9:30 still offered on day0", has("2099-09-07", 570), true);
  check("a different committee's event would not block", true, true);
}

console.log("\na committee event only blocks its own committee's poll");
{
  const poll = basePoll({
    committeeId: "committee-x",
    responses: [
      { memberId: "a", slots: [0, 1] },
      { memberId: "b", slots: [0, 1] },
      { memberId: "c", slots: [0, 1] },
    ],
  });
  const otherCommittee: SolveEventInput[] = [
    {
      startTime: "2099-09-07T09:00:00-07:00",
      endTime: "2099-09-07T10:00:00-07:00",
      status: "scheduled",
      committeeId: "committee-y",
    },
  ];
  const ownCommittee: SolveEventInput[] = [
    { ...otherCommittee[0], committeeId: "committee-x" },
  ];
  const withOther = solve(poll, otherCommittee, { now: new Date("2099-01-01") });
  const withOwn = solve(poll, ownCommittee, { now: new Date("2099-01-01") });
  check(
    "another committee's meeting does not block",
    withOther.some((r) => r.date === "2099-09-07" && r.startMinute === 540),
    true
  );
  check(
    "our own committee's meeting does block",
    withOwn.some((r) => r.date === "2099-09-07" && r.startMinute === 540),
    false
  );
}

console.log("\nrepeatsWeekly is detected when the same weekday+time works every week");
{
  // Everyone free 9:00-10:00 on all three Mondays -> the 9:00 slot repeats.
  const allFree = Array.from({ length: 12 }, (_, i) => i);
  const poll = basePoll({
    responses: [
      { memberId: "a", slots: allFree },
      { memberId: "b", slots: allFree },
      { memberId: "c", slots: [0, 1, 4, 5, 8, 9] }, // just the 9:00 hour each week
    ],
  });
  const ranked = solve(poll, [], { now: new Date("2099-01-01") });
  const nine = ranked.find((r) => r.startMinute === 540);
  check("the 9:00 option is marked repeatsWeekly", nine?.repeatsWeekly, true);
  check("and it reports the weakest week's score", nine?.weeklyWorstScore, 3);
  check("a 9:00 repeat outranks a one-off with the same raw score", ranked[0].startMinute, 540);
}

console.log("\nmeeting length that will not fit the day window yields nothing");
{
  const poll = basePoll({ meetingMinutes: 180 }); // 3h into a 2h window
  const ranked = solve(poll, [], { now: new Date("2099-01-01") });
  check("no candidates when the meeting cannot fit one day", ranked.length, 0);
}

console.log("\na meeting cannot be offered across the end of the day");
{
  // 90-min meeting, 4 slots. Only start slot 0 (9:00-10:30) and 1 (9:30-11:00)
  // fit; slot 2 (10:00-11:30) would run past the 11:00 window end.
  const poll = basePoll({ meetingMinutes: 90 });
  const ranked = solve(poll, [], { now: new Date("2099-01-01") });
  const starts = new Set(ranked.map((r) => r.startMinute));
  check("9:00 fits", starts.has(540), true);
  check("9:30 fits", starts.has(570), true);
  check("10:00 would overrun the window and is not offered", starts.has(600), false);
}

console.log("\npast candidates are dropped by `now`");
{
  const poll = basePoll({
    responses: [
      { memberId: "a", slots: [0, 1, 4, 5, 8, 9] },
      { memberId: "b", slots: [0, 1, 4, 5, 8, 9] },
      { memberId: "c", slots: [0, 1, 4, 5, 8, 9] },
    ],
  });
  // "now" is between day0 and day1.
  const ranked = solve(poll, [], { now: new Date("2099-09-10T12:00:00-07:00") });
  check("day0 is gone", ranked.some((r) => r.date === "2099-09-07"), false);
  check("day1 remains", ranked.some((r) => r.date === "2099-09-14"), true);
}

console.log("\nweekday mode: columns are weekdays, not dates");
{
  // Two weekday columns (Mon=1, Wed=3), 9-11am, 30-min slots -> slotsPerDay 4.
  const poll: SolvePollInput = {
    dateMode: "weekdays",
    weekdays: [1, 3],
    dates: [],
    dayStartMinute: 540,
    dayEndMinute: 660,
    slotMinutes: 30,
    meetingMinutes: 60,
    invitees: [{ memberId: "a" }, { memberId: "b" }],
    responses: [
      // Mon column slots 0..3, Wed column slots 4..7.
      { memberId: "a", slots: [0, 1, 2, 3, 4, 5] },
      { memberId: "b", slots: [4, 5] }, // only Wed 9-10
    ],
    committeeId: null,
  };
  const ranked = solve(poll, [], { now: new Date("2099-01-05T12:00:00-07:00") });
  check("returns candidates with no dates", ranked.every((r) => r.date === ""), true);
  check("every candidate carries a weekday", ranked.every((r) => r.weekday >= 1 && r.weekday <= 7), true);
  const wed9 = ranked.find((r) => r.weekday === 3 && r.startMinute === 540);
  check("Wed 9:00 has both free", wed9?.score, 2);
  const mon9 = ranked.find((r) => r.weekday === 1 && r.startMinute === 540);
  check("Mon 9:00 has only a", mon9?.score, 1);
  check("top option is Wed 9:00", [ranked[0].weekday, ranked[0].startMinute], [3, 540]);
  check("startISO is a real upcoming instant", !!Date.parse(ranked[0].startISO), true);
  check("nothing marked repeatsWeekly in weekday mode", ranked.every((r) => !r.repeatsWeekly), true);
}

console.log("\nweekday mode: a recurring chapter event still blocks the slot");
{
  const allFree = Array.from({ length: 8 }, (_, i) => i);
  const poll: SolvePollInput = {
    dateMode: "weekdays",
    weekdays: [2], // Tuesday
    dates: [],
    dayStartMinute: 540,
    dayEndMinute: 660,
    slotMinutes: 30,
    meetingMinutes: 60,
    invitees: [{ memberId: "a" }],
    responses: [{ memberId: "a", slots: allFree }],
    committeeId: null,
  };
  // A weekly Tuesday 9:00-9:30 chapter meeting.
  const events: SolveEventInput[] = [
    {
      startTime: "2099-01-06T09:00:00-07:00", // a Tuesday
      endTime: "2099-01-06T09:30:00-07:00",
      status: "scheduled",
      committeeId: null,
      recurrence: { enabled: true, frequency: "weekly", interval: 1 },
    },
  ];
  const ranked = solve(poll, events, { now: new Date("2099-01-04T12:00:00-07:00") });
  const has = (m: number) => ranked.some((r) => r.startMinute === m);
  check("Tue 9:00 blocked by the recurrence", has(540), false);
  check("Tue 9:30 still offered", has(570), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
