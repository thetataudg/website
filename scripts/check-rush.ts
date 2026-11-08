// Pure checks for the rush page editor. No DB, no network.
//
//   npm run check:rush
import { RUSH_DEFAULTS, DEFAULT_POSTER_SRC } from "@/lib/rush/defaults";
import {
  isValidInterestUrl,
  remainingEvents,
  rushEventLabel,
  toRushView,
} from "@/lib/rush/format";
import { canEditRushPageWith } from "@/lib/rush/permissions";

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

console.log("\ndefaults match the hardcoded page");
{
  const view = toRushView(RUSH_DEFAULTS);
  check("eyebrow", view.eyebrow, "Fall 2026 Recruitment");
  check("title", view.title, "Rush Theta Tau");
  check("card heading", view.eventsHeading, "Remaining Fall 2026 Events");
  check("closed message", view.closedMessage, "Rush for this semester has ended.");
  check("label", view.interestFormLabel, "Rush Interest Form");
  check(
    "interest form url",
    view.interestFormUrl,
    "https://airtable.com/appgjGGPxHjbzUs5U/pagGkFkzKTCxjJNU1/form"
  );
  check("poster falls back to the static flyer", view.posterSrc, DEFAULT_POSTER_SRC);
  check("poster size", [view.posterWidth, view.posterHeight], [1080, 1350]);
  check(
    "event labels, in the old 'date · time' form",
    view.events.map((e) => e.label),
    [
      "August 25 · 7:00 PM",
      "August 26 · 7:00 PM",
      "August 28 · 7:00 PM",
      "September 1 · 7:00 PM",
      "September 3 · 7:00 PM",
      "September 4 · 6:30 PM",
    ]
  );
  check(
    "event titles and order",
    view.events.map((e) => e.title),
    ["Game Night", "Jeopardy Night", "Engineering Challenge", "Chips and Salsa Lessons", "Engineers in Service", "Meet the House"]
  );
  check(
    "featuring lines",
    view.events.map((e) => e.featuring ?? null),
    ["Featuring Board Game Club", null, null, "Featuring IEEE and Salsa Club", null, null]
  );
  check("locations", view.events.map((e) => e.location), ["GWC 487", "GWC 487", "GWC 487", "BDH 192", "GWC 487", "MU 202"]);
  check("no em dashes in default copy", /—/.test(JSON.stringify(RUSH_DEFAULTS)), false);
}

console.log("\nlabels are Phoenix time whatever the server zone");
{
  // 02:00 UTC on the 26th is 7pm on the 25th in Phoenix.
  check("UTC instant", rushEventLabel("2026-08-26T02:00:00Z"), "August 25 · 7:00 PM");
  check("midnight Phoenix", rushEventLabel("2026-09-02T07:00:00Z"), "September 2 · 12:00 AM");
}

console.log("\nremaining events around midnight Phoenix");
{
  const events = [
    { key: "late", startsAt: "2026-09-01T23:30:00-07:00" },
    { key: "next", startsAt: "2026-09-02T19:00:00-07:00" },
  ];
  const keys = (now: string) => remainingEvents(events, new Date(now)).map((e) => e.key);
  check("before it starts", keys("2026-09-01T23:00:00-07:00"), ["late", "next"]);
  check("past midnight, still in progress", keys("2026-09-02T00:30:00-07:00"), ["late", "next"]);
  check("2h59m after start, still listed", keys("2026-09-02T02:29:00-07:00"), ["late", "next"]);
  check("3h after start, dropped", keys("2026-09-02T02:30:00-07:00"), ["next"]);
  check("all past", keys("2026-09-03T00:00:00-07:00"), []);
  check(
    "sorted even when entered out of order",
    remainingEvents([events[1], events[0]], new Date("2026-09-01T00:00:00-07:00")).map((e) => e.key),
    ["late", "next"]
  );
}

console.log("\nhidden events and poster");
{
  const view = toRushView({
    ...RUSH_DEFAULTS,
    events: [
      { title: "A", startsAt: "2026-09-02T02:00:00Z", location: "X", hidden: true },
      { title: "B", startsAt: "2026-09-01T02:00:00Z", location: "Y" },
    ],
    poster: { key: "rush/abc-123.jpg", width: 800, height: 1000, alt: "Flyer", hidden: false },
  });
  check("hidden dropped", view.events.map((e) => e.title), ["B"]);
  check("uploaded poster served from our route", view.posterSrc, "/api/rush/poster/rush/abc-123.jpg");
  check(
    "hidden poster",
    toRushView({ ...RUSH_DEFAULTS, poster: { ...RUSH_DEFAULTS.poster, hidden: true } }).posterSrc,
    null
  );
}

console.log("\ninterest form url");
{
  check("https ok", isValidInterestUrl("https://forms.gle/abc"), true);
  check("http refused", isValidInterestUrl("http://forms.gle/abc"), false);
  check("javascript refused", isValidInterestUrl("javascript:alert(1)"), false);
  check("garbage refused", isValidInterestUrl("airtable form"), false);
  check("empty refused", isValidInterestUrl(""), false);
}

console.log("\nwho can edit");
{
  const head = { _id: "h1", role: "member" };
  const rush = { committeeHeadId: "h1" };
  check("rush head", canEditRushPageWith(head, rush), true);
  check("someone else", canEditRushPageWith({ _id: "m2", role: "member" }, rush), false);
  check("no rush committee set", canEditRushPageWith(head, null), false);
  check("admin", canEditRushPageWith({ _id: "a", role: "admin" }, null), true);
  check("E-Council", canEditRushPageWith({ _id: "e", role: "member", isECouncil: true }, null), true);
  check("signed out", canEditRushPageWith(null, rush), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
