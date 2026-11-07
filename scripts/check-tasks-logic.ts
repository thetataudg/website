// Pure checks for the task tracker and bug portal. No DB, no network.
//
//   npm run check:tasks
import { escapeText } from "@/lib/calendarFeed";
import { canReport, canSeeBug, screenshotPrefixFor } from "@/lib/bugs/permissions";
import { parseRef, formatRef, newRefNumber } from "@/lib/bugs/constants";
import { renderMarkdown } from "@/lib/markdownSafe";
import { renderTemplate, TRANSACTIONAL_TEMPLATES, isReminderTemplate } from "@/lib/notify/templates";
import { buildDigest } from "@/lib/tasks/digest";
import { taskEventBlock } from "@/lib/tasks/ics";
import {
  allDayDueAt,
  digestDue,
  dueState,
  isQuietHours,
  parseMentions,
  parseTaskKey,
  publicStatusForTask,
  remindersDue,
  sortBetween,
  staleLevel,
  statusTimes,
  newTaskCode,
  taskKey,
} from "@/lib/tasks/logic";
import { assertTrackerAccess, canManageTracker, canViewTracker } from "@/lib/tasks/permissions";

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
const phx = (local: string) => new Date(`${local}-07:00`);
const throws = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (err: any) {
    return err?.statusCode ?? "threw";
  }
};

console.log("\ntask status drives the reporter's status");
check("backlog", publicStatusForTask("backlog"), "triaged");
check("todo", publicStatusForTask("todo"), "triaged");
check("in_progress", publicStatusForTask("in_progress"), "in_progress");
check("in_review", publicStatusForTask("in_review"), "in_progress");
check("done", publicStatusForTask("done"), "fixed");
check("canceled", publicStatusForTask("canceled"), "wont_fix");

console.log("\nkeys and refs");
check("key format", taskKey({ code: "7K2M" }), "TTDG-7K2M");
check("parse key", parseTaskKey("ttdg-7k2m"), { code: "7K2M" });
check("parse bare code", parseTaskKey("7K2M"), { code: "7K2M" });
check("reject junk key", parseTaskKey("TTDG-12345"), null);
check("code is 4 safe chars", /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(newTaskCode()), true);
check("ref format", formatRef(2741), "TTDG-R2741");
check("ref round trip", parseRef(formatRef(2741)), 2741);
check("old ref links still parse", parseRef("R-27"), 27);
check("bare four digits", parseRef("2741"), 2741);
check("random ref is four digits", /^\d{4}$/.test(String(newRefNumber())), true);

console.log("\ndue dates in Phoenix");
{
  const due = allDayDueAt("2026-11-12");
  check("all-day due is 23:59 Phoenix", due.toISOString(), "2026-11-13T06:59:00.000Z");
  const task = { status: "todo" as const, dueAt: due, dueAllDay: true };
  check("due today at 9am Phoenix", dueState(task, phx("2026-11-12T09:00:00")), "today");
  // 11pm Phoenix is already the 13th in UTC; still the same Phoenix day.
  check("still today at 11:30pm Phoenix", dueState(task, phx("2026-11-12T23:30:00")), "today");
  check("overdue one minute after midnight", dueState(task, phx("2026-11-13T00:00:30")), "overdue");
  check("soon the evening before", dueState(task, phx("2026-11-11T20:00:00")), "soon");
  check("nothing a week out", dueState(task, phx("2026-11-05T12:00:00")), null);
  check("done tasks are never overdue", dueState({ ...task, status: "done" }, phx("2026-12-01T12:00:00")), null);
}

console.log("\nstale chips");
{
  const t = (days: number, status: any = "in_progress") => ({
    status,
    lastActivityAt: new Date(phx("2026-11-20T12:00:00").getTime() - days * 86_400_000),
  });
  const now = phx("2026-11-20T12:00:00");
  check("4 days: fine", staleLevel(t(4), now), null);
  check("5 days: amber", staleLevel(t(5), now), "amber");
  check("10 days: red", staleLevel(t(10), now), "red");
  check("todo never goes stale", staleLevel(t(30, "todo"), now), null);
  check("in review counts as started", staleLevel(t(6, "in_review"), now), "amber");
}

console.log("\nreminders fire once (cron idempotency)");
{
  const base = {
    status: "in_progress" as const,
    assigneeIds: ["a"],
    dueAt: allDayDueAt("2026-11-12"),
    dueAllDay: true,
    lastActivityAt: phx("2026-11-01T12:00:00"),
    reminderState: {} as any,
  };
  // Simulate the cron: each run stamps what it sent.
  const run = (task: any, now: Date) => {
    const kinds = remindersDue(task, now);
    for (const k of kinds) {
      const field = k === "due_soon" ? "dueSoonSentAt" : k === "overdue" ? "overdueSentAt" : "staleSentAt";
      task.reminderState[field] = now;
    }
    return kinds;
  };
  const task = { ...base, reminderState: {} as any };
  const evening = phx("2026-11-11T18:00:00");
  check("first run: due soon and stale", run(task, evening), ["due_soon", "stale"]);
  check("second run, same time: nothing", run(task, evening), []);
  check("fifteen minutes later: nothing", run(task, phx("2026-11-11T18:15:00")), []);
  check("due day itself: nothing new", run(task, phx("2026-11-12T22:00:00")), []);
  check("morning after: overdue once", run(task, phx("2026-11-13T08:00:00")), ["overdue"]);
  check("later that morning: nothing", run(task, phx("2026-11-13T10:00:00")), []);
  check("a week after the stale nudge: one repeat", run(task, phx("2026-11-18T18:00:00")), ["stale"]);
  check("right after the repeat: nothing", run(task, phx("2026-11-18T18:15:00")), []);
  const fresh = { ...base, lastActivityAt: phx("2026-11-18T19:00:00"), reminderState: { ...task.reminderState } };
  check("activity resets the stale spell", run(fresh, phx("2026-11-19T12:00:00")), []);
  const unassigned = { ...base, assigneeIds: [], reminderState: {} };
  check("unassigned tasks are not chased", remindersDue(unassigned, evening), []);
  check("archived tasks are not chased", remindersDue({ ...base, archivedAt: new Date(), reminderState: {} }, evening), []);
}

console.log("\nquiet hours and the digest clock");
check("7:59am is quiet", isQuietHours(phx("2026-11-16T07:59:00")), true);
check("8am is not", isQuietHours(phx("2026-11-16T08:00:00")), false);
check("8:59pm is not", isQuietHours(phx("2026-11-16T20:59:00")), false);
check("9pm is quiet", isQuietHours(phx("2026-11-16T21:00:00")), true);
// 2026-11-16 is a Monday.
check("Monday 8:59am: not yet", digestDue(phx("2026-11-16T08:59:00"), null, 1, 9), false);
check("Monday 9am: due", digestDue(phx("2026-11-16T09:00:00"), null, 1, 9), true);
check("Monday 9:15am after sending at 9: not again", digestDue(phx("2026-11-16T09:15:00"), phx("2026-11-16T09:00:00"), 1, 9), false);
check("next Monday: due again", digestDue(phx("2026-11-23T09:00:00"), phx("2026-11-16T09:00:00"), 1, 9), true);
check("Tuesday: never", digestDue(phx("2026-11-17T09:00:00"), null, 1, 9), false);

console.log("\ndigest contents");
{
  const now = phx("2026-11-16T09:00:00");
  const digest = buildDigest({
    committee: { name: "Technology" },
    names: new Map([["a", "Sam Lee"], ["b", "Alex Kim"]]),
    now,
    tasks: [
      { number: 1, code: "AAA1", title: "Fix login", status: "todo", assigneeIds: ["a"], dueAt: allDayDueAt("2026-11-10") },
      { number: 2, code: "AAA2", title: "Calendar sync", status: "in_progress", assigneeIds: ["b"], lastActivityAt: phx("2026-11-04T09:00:00") },
      { number: 3, code: "AAA3", title: "Dark mode bug", status: "todo", assigneeIds: [] },
      { number: 4, code: "AAA4", title: "Shipped", status: "done", assigneeIds: ["a"], completedAt: phx("2026-11-14T09:00:00") },
      { number: 5, code: "AAA5", title: "Old", status: "done", assigneeIds: ["a"], completedAt: phx("2026-10-01T09:00:00") },
    ],
  });
  check("counts", [digest.overdue, digest.stale, digest.done], [1, 1, 1]);
  check("lines", digest.lines, [
    "Overdue: TTDG-AAA1 Fix login (Sam Lee)",
    "Stale 12 days: TTDG-AAA2 Calendar sync (Alex Kim)",
    "Unassigned: TTDG-AAA3 Dark mode bug",
    "Closed this week: Sam Lee 1",
  ]);
}

console.log("\nstatus timestamps");
{
  const now = new Date("2026-11-10T12:00:00Z");
  const later = new Date("2026-11-12T12:00:00Z");
  const started = statusTimes("todo", "in_progress", {}, now);
  check("start stamps startedAt", started.startedAt?.toISOString(), now.toISOString());
  const reviewed = statusTimes("in_progress", "in_review", started, later);
  check("first start is kept", reviewed.startedAt?.toISOString(), now.toISOString());
  const done = statusTimes("in_review", "done", reviewed, later);
  check("done stamps completedAt", done.completedAt?.toISOString(), later.toISOString());
  check("reopen clears completedAt", statusTimes("done", "todo", done, later).completedAt, null);
}

console.log("\nboard ordering and mentions");
check("between", sortBetween(1024, 2048), 1536);
check("after last", sortBetween(2048, null), 3072);
check("before first", sortBetween(null, 0), -1024);
check(
  "mentions parsed",
  parseMentions("hey @[Sam Lee](64b7f0c2a1b2c3d4e5f60718) and @[Alex](64B7F0C2A1B2C3D4E5F60719) and @nobody"),
  ["64b7f0c2a1b2c3d4e5f60718", "64b7f0c2a1b2c3d4e5f60719"]
);

console.log("\npermission matrix");
{
  const committee = { _id: "c", committeeHeadId: "head", committeeMembers: ["m1", { _id: "m2" }] };
  const who = {
    admin: { _id: "x", role: "admin" },
    superadmin: { _id: "y", role: "superadmin" },
    ecouncil: { _id: "z", role: "member", isECouncil: true },
    head: { _id: "head", role: "member" },
    member: { _id: "m1", role: "member" },
    populated: { _id: "m2", role: "member" },
    stranger: { _id: "s", role: "member" },
  } as const;
  const matrix = Object.fromEntries(
    Object.entries(who).map(([name, actor]) => [name, [canViewTracker(actor, committee), canManageTracker(actor, committee)]])
  );
  check("view / manage by role", matrix, {
    admin: [true, true],
    superadmin: [true, true],
    ecouncil: [true, true],
    head: [true, true],
    member: [true, false],
    populated: [true, false],
    stranger: [false, false],
  });
  check("stranger gets 404, not 403", throws(() => assertTrackerAccess(who.stranger, committee)), 404);
  check("member can't manage: 403", throws(() => assertTrackerAccess(who.member, committee, "manage")), 403);
  check("head can manage", throws(() => assertTrackerAccess(who.head, committee, "manage")), null);
  check("no committee set: nobody", canViewTracker(who.admin, null), false);
  // Member.isCommitteeHead has drifted and must never grant anything.
  check("isCommitteeHead flag is ignored", canManageTracker({ _id: "s", isCommitteeHead: true } as any, committee), false);

  check("active can report", canReport({ _id: "a", status: "Active" }), true);
  check("alumni can report", canReport({ _id: "a", status: "Alumni" }), true);
  check("removed cannot", canReport({ _id: "a", status: "Removed" }), false);
  check("deceased cannot", canReport({ _id: "a", status: "Deceased" }), false);
  const bug = { reporterMemberId: "r", subscriberMemberIds: ["sub"] };
  check("reporter sees", canSeeBug({ _id: "r" }, bug, false), true);
  check("subscriber sees", canSeeBug({ _id: "sub" }, bug, false), true);
  check("tech sees", canSeeBug({ _id: "t" }, bug, true), true);
  check("others do not", canSeeBug({ _id: "o" }, bug, false), false);
  check("screenshot prefix", screenshotPrefixFor({ _id: "abc" }), "bugs/abc");
}

console.log("\nICS escaping");
check("semicolon escaped (was a no-op)", escapeText("a;b"), "a\\;b");
check("comma", escapeText("a,b"), "a\\,b");
check("backslash first", escapeText("a\\;"), "a\\\\\\;");
check("newline", escapeText("a\nb"), "a\\nb");
{
  const block = taskEventBlock({
    id: "t1",
    key: "TECH-14",
    title: "Fix sync; then, ship",
    dueAt: allDayDueAt("2026-11-12"),
    dueAllDay: true,
    url: "https://ttdg.org/member/tech/TECH-14",
    updatedAt: new Date("2026-11-01T00:00:00Z"),
  });
  check("uid namespaced", block.find((l) => l.startsWith("UID:")), "UID:task-t1@ttdg.org");
  check("all-day start is the Phoenix day", block.find((l) => l.startsWith("DTSTART")), "DTSTART;VALUE=DATE:20261112");
  check("all-day end is the next day", block.find((l) => l.startsWith("DTEND")), "DTEND;VALUE=DATE:20261113");
  check("summary escaped", block.find((l) => l.startsWith("SUMMARY")), "SUMMARY:[TECH-14] Fix sync\\; then\\, ship");
  check("alarm at 9am Phoenix", block.find((l) => l.startsWith("TRIGGER")), "TRIGGER;VALUE=DATE-TIME:20261112T160000Z");
}

console.log("\nmarkdown is safe");
check("raw html shown as text", renderMarkdown("<script>alert(1)</script>").includes("<script>"), false);
check("javascript links dropped", renderMarkdown("[x](javascript:alert(1))").includes("javascript:"), false);
check("https links kept", renderMarkdown("[x](https://ttdg.org)").includes('href="https://ttdg.org"'), true);
check("images dropped", renderMarkdown("![a](https://evil.example/x.png)").includes("<img"), false);
check("mentions render as names", renderMarkdown("@[Sam Lee](64b7f0c2a1b2c3d4e5f60718)").includes("@Sam Lee"), true);

console.log("\nnotification copy");
{
  const taskTemplates = TRANSACTIONAL_TEMPLATES.filter((t) => t.startsWith("task_") || t.startsWith("bug_"));
  check("13 task and bug templates", taskTemplates.length, 13);
  check("none are reminders (no shared cooldown)", taskTemplates.some((t) => isReminderTemplate(t)), false);
  const context = {
    firstName: "Sam",
    amountCents: 0,
    taskKey: "TECH-14",
    taskTitle: "Fix calendar sync",
    taskPath: "/member/tech/TECH-14",
    actorName: "Vinny Miller",
    dueLabel: "tomorrow",
    taskStatusLabel: "In review",
    staleDays: 6,
    committeeName: "Technology",
    commentExcerpt: "Looks good",
    bugRef: "TTDG-R2741",
    bugTitle: "Calendar shows wrong time",
    bugStatusLabel: "In progress",
    bugSeverityLabel: "Blocks me",
    memberName: "Alex Kim",
    digestOverdue: 3,
    digestStale: 2,
    digestDone: 5,
    digestLines: ["Overdue: TTDG-AAA1 Fix login"],
  };
  const rendered = taskTemplates.map((t) => renderTemplate(t, context));
  check("no em dashes anywhere", rendered.some((r) => /—/.test(JSON.stringify(r))), false);
  check("pushes fit on a lock screen", rendered.filter((r) => r.push.length > 120).map((r) => r.push), []);
  check("assigned push", renderTemplate("task_assigned", context).push, "Vinny Miller assigned you TECH-14: Fix calendar sync");
  check("review push", renderTemplate("task_status_changed", context).push, "TECH-14 is ready for review");
  check("digest push", renderTemplate("task_digest", context).push, "Technology weekly: 3 overdue, 2 stale, 5 done");
  check("received push", renderTemplate("bug_received", context).push, "We got your report TTDG-R2741");
  check("task links", renderTemplate("task_overdue", context).link, "/member/tech/TECH-14");
  check("reporter links", renderTemplate("bug_reply", context).link, "/report/TTDG-R2741");
  check(
    "status email reads as a sentence",
    renderTemplate("bug_status_changed", { ...context, bugStatus: "wont_fix", bugStatusLabel: "Won't fix" }).title,
    "Your report TTDG-R2741 won't be fixed"
  );
  check("bug_new goes to triage", renderTemplate("bug_new", context).link, "/member/tech/triage");
  check("categories", Array.from(new Set(rendered.map((r) => r.category))).sort(), ["bugs", "tasks"]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
