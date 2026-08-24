import { serializeCharge, isPastDueInArizona, arizonaDueDeadline, normalizeDueDate } from "@/lib/dues";
import { formatCents } from "@/lib/financeEvents";
import { fromAddressFor, alertsDomain, replyToFor } from "@/lib/notify/from";
import { renderTemplate } from "@/lib/notify/templates";
import { renderEmailHtml, renderEmailText } from "@/lib/notify/emailTemplate";
import {
  maxInstallmentsFor,
  planIsPossible,
  splitEvenly,
  addMonthsUtc,
  buildSchedule,
  proposalWindowOpen,
  derivePlanProgress,
  currentDue,
  currentDueAcross,
  planIsFinished,
  partitionPlans,
  chargeIdsUnderLivePlans,
  denialGraceUntil,
  graceWindowOpen,
} from "@/lib/plans";

let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

console.log("\nPhoenix end-of-day boundary");
// A due date stored as UTC midnight on Sept 1. Phoenix is UTC-7, so the
// chapter's Sept 1 does not end until 07:00 UTC on Sept 2.
const dueUtcMidnight = new Date("2026-09-01T00:00:00.000Z");
check("UTC-midnight input means Sept 1 in Phoenix", arizonaDueDeadline(dueUtcMidnight)?.toISOString(), "2026-09-02T06:59:59.999Z");
check("date-only string agrees", arizonaDueDeadline("2026-09-01")?.toISOString(), "2026-09-02T06:59:59.999Z");
check("stored as the plain calendar date", normalizeDueDate("2026-09-01")?.toISOString(), "2026-09-01T00:00:00.000Z");
check("normalizing is idempotent", normalizeDueDate(normalizeDueDate("2026-09-01"))?.toISOString(), "2026-09-01T00:00:00.000Z");
check("deadline survives a round trip", arizonaDueDeadline(normalizeDueDate("2026-09-01"))?.toISOString(), "2026-09-02T06:59:59.999Z");
check("a picker sending local-midnight ISO still means Sept 1", normalizeDueDate("2026-09-01T00:00:00.000Z")?.toISOString(), "2026-09-01T00:00:00.000Z");
check("5pm Phoenix Aug 31 -> not past due", isPastDueInArizona(dueUtcMidnight, new Date("2026-09-01T00:00:00.000Z")), false);
check("11pm Phoenix Sept 1 -> not past due", isPastDueInArizona(dueUtcMidnight, new Date("2026-09-02T06:00:00.000Z")), false);
check("12:01am Phoenix Sept 2 -> past due", isPastDueInArizona(dueUtcMidnight, new Date("2026-09-02T07:01:00.000Z")), true);

console.log("\nthe old behaviour this replaces");
// Under `dueDate < now`, the second case above was already overdue — a member
// got an overdue flag at 5pm Phoenix on Aug 31, a full day early.
check("old naive compare would have said overdue", dueUtcMidnight < new Date("2026-09-01T00:00:00.001Z"), true);

console.log("\nserializeCharge");
const base = { _id: "a", memberId: "m", term: "Fall 2026", description: "Chapter dues", category: "dues", amountCents: 25000, payments: [], dueDate: dueUtcMidnight, status: "open" };
check("open + unpaid + day passed -> overdue", serializeCharge(base, new Date("2026-09-02T08:00:00.000Z")).isOverdue, true);
check("suppressOverdue wins", serializeCharge(base, new Date("2026-09-02T08:00:00.000Z"), true).isOverdue, false);
check("paid in full -> never overdue", serializeCharge({ ...base, payments: [{ amountCents: 25000 }] }, new Date("2026-12-01T00:00:00.000Z")).isOverdue, false);
check("waived -> never overdue", serializeCharge({ ...base, status: "waived" }, new Date("2026-12-01T00:00:00.000Z")).isOverdue, false);
check("void -> balance zero", serializeCharge({ ...base, status: "void" }).balanceCents, 0);
check("credit payment counts toward paid", serializeCharge({ ...base, payments: [{ amountCents: 4000, method: "credit" }] }).balanceCents, 21000);

console.log("\nformatCents");
check("whole dollars drop cents", formatCents(25000), "$250");
check("partial keeps two places", formatCents(8334), "$83.34");
check("thousands separator", formatCents(123456), "$1,234.56");
check("negative for payouts", formatCents(-15000), "-$150");
check("zero", formatCents(0), "$0");

console.log("\nmaxInstallmentsFor — the $25 floor and the 8-month ceiling interact");
// Straight from the plan's worked table.
check("$250 -> 8, the ceiling binds first", maxInstallmentsFor(25000), 8);
check("$150 -> 6, exactly at the floor", maxInstallmentsFor(15000), 6);
check("$100 -> 4", maxInstallmentsFor(10000), 4);
check("$40 -> no plan at all", maxInstallmentsFor(4000), 0);
check("$49.99 is still under two floors", maxInstallmentsFor(4999), 0);
check("$50 is the smallest plannable balance", maxInstallmentsFor(5000), 2);
check("$74.99 still only splits two ways", maxInstallmentsFor(7499), 2);
check("$75 splits three ways", maxInstallmentsFor(7500), 3);
check("$200 -> 8, the ceiling again", maxInstallmentsFor(20000), 8);
check("zero owed offers nothing", maxInstallmentsFor(0), 0);
check("a negative balance offers nothing", maxInstallmentsFor(-5000), 0);
check("planIsPossible agrees with the floor", [planIsPossible(4999), planIsPossible(5000)], [false, true]);

console.log("\nsplitEvenly — the stray cent goes on the earliest installments");
check("$250 over 3", splitEvenly(25000, 3), [8334, 8333, 8333]);
check("$250 over 4 divides cleanly", splitEvenly(25000, 4), [6250, 6250, 6250, 6250]);
check("$175 over 3", splitEvenly(17500, 3), [5834, 5833, 5833]);
check("$100.01 over 2", splitEvenly(10001, 2), [5001, 5000]);
check("remainder 7 over 8 fills the first seven", splitEvenly(807, 8), [101, 101, 101, 101, 101, 101, 101, 100]);
check("every split sums to the penny", [
  splitEvenly(25000, 3).reduce((a, b) => a + b, 0),
  splitEvenly(17500, 3).reduce((a, b) => a + b, 0),
  splitEvenly(10001, 7).reduce((a, b) => a + b, 0),
  splitEvenly(9999, 8).reduce((a, b) => a + b, 0),
], [25000, 17500, 10001, 9999]);
check("no installment is ever more than a cent from another", (() => {
  const parts = splitEvenly(9999, 8);
  return Math.max(...parts) - Math.min(...parts);
})(), 1);
check("the last installment is never the odd one out", (() => {
  const parts = splitEvenly(25000, 3);
  return parts[parts.length - 1] <= parts[0];
})(), true);
check("a count of zero yields nothing", splitEvenly(25000, 0), []);

console.log("\nmonthly anchoring");
const sept1 = normalizeDueDate("2026-09-01") as Date;
check("first installment sits on the charge's own due date", buildSchedule(25000, 3, sept1)[0].dueDate.toISOString(), "2026-09-01T00:00:00.000Z");
check("then monthly", buildSchedule(25000, 3, sept1).map((i) => i.dueDate.toISOString()), [
  "2026-09-01T00:00:00.000Z",
  "2026-10-01T00:00:00.000Z",
  "2026-11-01T00:00:00.000Z",
]);
check("amounts follow the split", buildSchedule(25000, 3, sept1).map((i) => i.amountCents), [8334, 8333, 8333]);
check("seq starts at one", buildSchedule(25000, 3, sept1).map((i) => i.seq), [1, 2, 3]);
// A plan anchored on the 31st has to mean something in February.
check("Jan 31 + 1 month clamps to Feb 28", addMonthsUtc(normalizeDueDate("2027-01-31") as Date, 1).toISOString(), "2027-02-28T00:00:00.000Z");
check("and Feb 29 in a leap year", addMonthsUtc(normalizeDueDate("2028-01-31") as Date, 1).toISOString(), "2028-02-29T00:00:00.000Z");
check("clamping doesn't stick — month 2 is back on the 31st", addMonthsUtc(normalizeDueDate("2027-01-31") as Date, 2).toISOString(), "2027-03-31T00:00:00.000Z");
check("eight installments cross the year end", buildSchedule(40000, 8, sept1)[7].dueDate.toISOString(), "2027-04-01T00:00:00.000Z");

console.log("\nthe proposal window — hard on asking, silent on paying");
const openCharge = { _id: "c1", status: "open", amountCents: 25000, payments: [], dueDate: sept1 };
check("11pm Phoenix on the due date still lets you ask", proposalWindowOpen([openCharge], new Date("2026-09-02T06:00:00.000Z")), true);
check("12:01am the next day does not", proposalWindowOpen([openCharge], new Date("2026-09-02T07:01:00.000Z")), false);
check("a charge with no due date can't have missed one", proposalWindowOpen([{ ...openCharge, dueDate: null }], new Date("2030-01-01T00:00:00.000Z")), true);
// The earliest deadline binds: if one charge is already late, the member missed
// the window whatever else they owe.
check("the earliest due date binds", proposalWindowOpen([
  { ...openCharge, dueDate: normalizeDueDate("2026-12-01") },
  { ...openCharge, _id: "c2", dueDate: sept1 },
], new Date("2026-10-01T00:00:00.000Z")), false);
check("a settled charge doesn't bind — nothing is owed on it", proposalWindowOpen([
  { ...openCharge, _id: "c2", payments: [{ amountCents: 25000 }] },
  { ...openCharge, dueDate: normalizeDueDate("2026-12-01") },
], new Date("2026-10-01T00:00:00.000Z")), true);

console.log("\nderived installment status — nothing stores a paid flag");
const planCharge = (payments: any[], status = "open") => ({
  _id: "c1", memberId: "m", term: "Fall 2026", description: "Chapter dues",
  category: "dues", amountCents: 25000, payments, dueDate: sept1, status,
});
const plan = {
  _id: "p1", memberId: "m", term: "Fall 2026", status: "active",
  chargeIds: ["c1"], totalCents: 25000, baselinePaidCents: 0,
  installments: buildSchedule(25000, 3, sept1),
};
const beforeAny = new Date("2026-08-20T12:00:00.000Z");
const afterFirst = new Date("2026-09-15T12:00:00.000Z");
const afterSecond = new Date("2026-10-15T12:00:00.000Z");

check("nothing paid, nothing due yet", derivePlanProgress(plan, [planCharge([])], beforeAny).installments.map((i) => i.status), ["due", "upcoming", "upcoming"]);
check("headline is the first installment, not the balance", derivePlanProgress(plan, [planCharge([])], beforeAny).amountDueNowCents, 8334);
check("and it points at the first date", derivePlanProgress(plan, [planCharge([])], beforeAny).dueNowDate, "2026-09-01T00:00:00.000Z");

// A member's claim, a treasurer's manual entry and an automatic credit
// application are all just money on the charge — the plan advances either way.
check("exact first installment -> paid, second becomes due", derivePlanProgress(plan, [planCharge([{ amountCents: 8334 }])], beforeAny).installments.map((i) => i.status), ["paid", "due", "upcoming"]);
check("a credit payment advances the plan the same way", derivePlanProgress(plan, [planCharge([{ amountCents: 8334, method: "credit" }])], beforeAny).amountDueNowCents, 8333);
check("a partial payment leaves the installment due for the rest", derivePlanProgress(plan, [planCharge([{ amountCents: 4000 }])], beforeAny).installments[0], { seq: 1, dueDate: "2026-09-01T00:00:00.000Z", amountCents: 8334, paidCents: 4000, remainingCents: 4334, status: "due" });
check("overpayment spills into the next installment", derivePlanProgress(plan, [planCharge([{ amountCents: 12000 }])], beforeAny).installments.map((i) => i.paidCents), [8334, 3666, 0]);
check("paying the lot completes the plan", derivePlanProgress(plan, [planCharge([{ amountCents: 25000 }])], beforeAny).isComplete, true);
check("a completed plan asks for nothing", derivePlanProgress(plan, [planCharge([{ amountCents: 25000 }])], beforeAny).amountDueNowCents, 0);
check("more than the total doesn't invent progress", derivePlanProgress(plan, [planCharge([{ amountCents: 25000 }])], beforeAny).paidCents, 25000);

console.log("\nmissing an installment — arrears accumulate, the balance doesn't accelerate");
// The next installment is genuinely upcoming — its own date is still weeks off.
// Only the missed one is being asked for.
check("one missed installment is late, the rest untouched", derivePlanProgress(plan, [planCharge([])], afterFirst).installments.map((i) => i.status), ["late", "upcoming", "upcoming"]);
check("and only that installment is owed", derivePlanProgress(plan, [planCharge([])], afterFirst).amountDueNowCents, 8334);
check("one miss doesn't default the plan", derivePlanProgress(plan, [planCharge([])], afterFirst).shouldDefault, false);
check("two missed installments accumulate", derivePlanProgress(plan, [planCharge([])], afterSecond).amountDueNowCents, 16667);
check("two consecutive misses flag a conversation", derivePlanProgress(plan, [planCharge([])], afterSecond).shouldDefault, true);
check("never the whole balance", derivePlanProgress(plan, [planCharge([])], afterSecond).amountDueNowCents < 25000, true);
check("catching up clears the flag", derivePlanProgress(plan, [planCharge([{ amountCents: 16667 }])], afterSecond).shouldDefault, false);
check("a part-paid late installment still counts as missed", derivePlanProgress(plan, [planCharge([{ amountCents: 4000 }])], afterFirst).missedCount, 1);

console.log("\nbaselinePaidCents measures this plan, not the member's history");
const midPlan = { ...plan, totalCents: 15000, baselinePaidCents: 10000, installments: buildSchedule(15000, 3, sept1) };
check("money paid before the plan doesn't advance it", derivePlanProgress(midPlan, [planCharge([{ amountCents: 10000 }])], beforeAny).paidCents, 0);
check("only what lands after the baseline counts", derivePlanProgress(midPlan, [planCharge([{ amountCents: 15000 }])], beforeAny).paidCents, 5000);

console.log("\nwaiving and voiding a charge under a live plan");
check("waived charge completes the plan", derivePlanProgress(plan, [planCharge([], "waived")], afterSecond).isComplete, true);
check("and stops asking for anything", derivePlanProgress(plan, [planCharge([], "waived")], afterSecond).amountDueNowCents, 0);
check("unpaid installments read as waived, not late", derivePlanProgress(plan, [planCharge([], "waived")], afterSecond).installments.map((i) => i.status), ["waived", "waived", "waived"]);
check("a voided charge's payments aren't plan progress", derivePlanProgress(plan, [planCharge([{ amountCents: 8334 }], "void")], beforeAny).paidCents, 0);

console.log("\ncurrentDue — what the headline number switches to");
check("no plan means the whole balance", currentDue(null, [planCharge([])], 25000, "2026-09-01T00:00:00.000Z", beforeAny), { amountDueNowCents: 25000, dueNowDate: "2026-09-01T00:00:00.000Z" });
// A proposal isn't an agreement. Until an officer says yes, the member still
// owes the full amount — they just aren't overdue while they wait.
check("a pending proposal doesn't move the number", currentDue({ ...plan, status: "pending" }, [planCharge([])], 25000, "2026-09-01T00:00:00.000Z", beforeAny).amountDueNowCents, 25000);
check("an active plan shows this month", currentDue(plan, [planCharge([])], 25000, "2026-09-01T00:00:00.000Z", beforeAny).amountDueNowCents, 8334);
check("a denied plan doesn't move it either", currentDue({ ...plan, status: "denied" }, [planCharge([])], 25000, null, beforeAny).amountDueNowCents, 25000);

console.log("\nmany plans at once — one per thing they asked to spread out");
// A member puts their $250 dues on a plan, then picks up a $500 trip deposit
// and puts that on a second one. Two schedules, disjoint charges.
const tripCharge = {
  _id: "c2", memberId: "m", term: "Fall 2026", description: "Trip deposit",
  category: "other", amountCents: 50000, payments: [] as any[],
  dueDate: normalizeDueDate("2026-10-01"), status: "open",
};
const tripPlan = {
  _id: "p2", memberId: "m", term: "Fall 2026", status: "active",
  chargeIds: ["c2"], totalCents: 50000, baselinePaidCents: 0,
  installments: buildSchedule(50000, 2, normalizeDueDate("2026-10-01")),
};
check("both plans' installments, not both balances", currentDueAcross([plan, tripPlan], [planCharge([]), tripCharge], null, beforeAny).amountDueNowCents, 8334 + 25000);
check("and it points at whichever lands first", currentDueAcross([plan, tripPlan], [planCharge([]), tripCharge], null, beforeAny).dueNowDate, "2026-09-01T00:00:00.000Z");
// A charge nobody put on a plan is owed in full — hiding it would be a lie.
check("an unplanned charge is added at full balance", currentDueAcross([plan], [planCharge([]), tripCharge], null, beforeAny).amountDueNowCents, 8334 + 50000);
check("no plans at all is just the balance", currentDueAcross([], [planCharge([]), tripCharge], null, beforeAny).amountDueNowCents, 75000);
// A pending proposal is not an agreement, so its charges still read in full.
check("a pending proposal doesn't discount anything", currentDueAcross([{ ...plan, status: "pending" }], [planCharge([])], null, beforeAny).amountDueNowCents, 25000);
check("a paid-off plan leaves nothing behind", currentDueAcross([plan], [planCharge([{ amountCents: 25000 }])], null, beforeAny).amountDueNowCents, 0);

console.log("\narchiving — a finished plan gets out of the way immediately");
// The nightly cron is what writes `completed`. If the screens waited for it, a
// plan paid off this morning would sit there as the member's live plan until
// 9am tomorrow — which is exactly the bug this derivation avoids.
check("still collecting", planIsFinished(plan, [planCharge([])], beforeAny), false);
check("paid off, though stored status still says active", planIsFinished(plan, [planCharge([{ amountCents: 25000 }])], beforeAny), true);
check("a waived charge finishes it too", planIsFinished(plan, [planCharge([], "waived")], afterSecond), true);
check("a stored terminal status is final either way", planIsFinished({ ...plan, status: "cancelled" }, [planCharge([])], beforeAny), true);
// An unanswered proposal is not "finished" however the money looks.
check("a pending proposal is never archived", planIsFinished({ ...plan, status: "pending" }, [planCharge([{ amountCents: 25000 }])], beforeAny), false);

const split = partitionPlans([plan, tripPlan], [planCharge([{ amountCents: 25000 }]), tripCharge], beforeAny);
check("the paid one archives", split.finished.map((p: any) => p._id), ["p1"]);
check("the other keeps collecting", split.live.map((p: any) => p._id), ["p2"]);

console.log("\none plan per charge — the conflict set");
check("a live plan speaks for its charges", Array.from(chargeIdsUnderLivePlans([plan, tripPlan], [planCharge([]), tripCharge], beforeAny)).sort(), ["c1", "c2"]);
// Once a plan is paid off its charges are free again — not that it matters,
// since a settled charge has nothing left to spread out.
check("a finished plan releases them", Array.from(chargeIdsUnderLivePlans([plan], [planCharge([{ amountCents: 25000 }])], beforeAny)), []);
check("a pending proposal still holds them", Array.from(chargeIdsUnderLivePlans([{ ...plan, status: "pending" }], [planCharge([])], beforeAny)), ["c1"]);

console.log("\nthe grace window after a denial");
const denialGrace = denialGraceUntil(new Date("2026-09-01T20:00:00.000Z"));
check("five Phoenix days, ending at end of day", denialGrace.toISOString(), "2026-09-07T06:59:59.999Z");
check("a denied plan holds off overdue while it lasts", graceWindowOpen({ status: "denied", graceUntil: denialGrace }, new Date("2026-09-05T00:00:00.000Z")), true);
check("and stops when it expires", graceWindowOpen({ status: "denied", graceUntil: denialGrace }, new Date("2026-09-08T00:00:00.000Z")), false);
check("an active plan has no grace window", graceWindowOpen({ status: "active", graceUntil: denialGrace }, new Date("2026-09-05T00:00:00.000Z")), false);

console.log("\nwho chapter mail comes from");
// Automated mail sends from the alerts. subdomain so a bounce storm on sixty
// dues notices can never hurt deliverability for real mail from real people.
check("dues", fromAddressFor("dues"), "Theta Tau Treasury <dues@alerts.ttdg.org>");
// Plans and reimbursements share dues@ on purpose: it's one conversation about
// one member's money, and splitting it scatters their inbox thread.
check("plans share the treasury mailbox", fromAddressFor("plan"), "Theta Tau Treasury <dues@alerts.ttdg.org>");
check("so do reimbursements", fromAddressFor("reimbursement"), "Theta Tau Treasury <dues@alerts.ttdg.org>");
check("events get their own", fromAddressFor("events"), "Theta Tau Events <events@alerts.ttdg.org>");
check("anything else falls back rather than throwing", fromAddressFor("something-new"), "Theta Tau <chapter@alerts.ttdg.org>");
check("never the apex domain", fromAddressFor("dues").includes("@ttdg.org"), false);
check("the subdomain is the default", alertsDomain(), "alerts.ttdg.org");
// Receiving is disabled on the alerts subdomain, so a reply would vanish at
// exactly the moment a member most wants a human.
// The From mailboxes live on a subdomain with receiving disabled, so without a
// Reply-To a member hitting reply is typing into a void.
check("dues replies reach the treasurer", replyToFor("dues"), "treasurer@thetatau-dg.org");
check("so do plan replies", replyToFor("plan"), "treasurer@thetatau-dg.org");
check("and reimbursement replies", replyToFor("reimbursement"), "treasurer@thetatau-dg.org");
check("events go elsewhere", replyToFor("events"), "general@thetatau-dg.org");
check("an unknown category still reaches a human", replyToFor("whatever"), "general@thetatau-dg.org");
check("never back to the send-only subdomain", replyToFor("dues").includes("alerts."), false);

console.log("\nevery template routes to a real mailbox");
for (const template of [
  "assigned", "upcoming", "due_soon", "due_today", "overdue", "installment_due",
  "payment_verified", "payment_rejected", "plan_approved", "plan_denied", "credit_paid_out",
] as const) {
  const rendered = renderTemplate(template, {
    firstName: "Sam", amountCents: 25000, dueLabel: "Sept 1",
    installmentCount: 3, installmentSeq: 1, reason: "test", method: "venmo",
  });
  const from = fromAddressFor(rendered.category);
  check(`${template} has a sender`, /^[^<]+<[a-z]+@alerts\.ttdg\.org>$/.test(from), true);
}

console.log("\nthe email layout survives what members actually type");
// A treasurer's rejection note and a member's own name go into these emails
// verbatim. An unescaped apostrophe or angle bracket would break the layout at
// best and inject markup at worst — and "O'Brien" is a name, not an edge case.
const nasty = renderEmailHtml({
  title: `O'Brien & <script>alert(1)</script>`,
  paragraphs: [`Couldn't find it — check "Venmo" & resend <b>now</b>`],
  heroAmount: "$250",
  heroLabel: "Amount due",
  meta: [{ label: "Note <b>", value: `it's "fine" & <em>ok</em>`, tone: "negative" }],
  ctaLabel: "Open",
  ctaHref: "https://example.org/a?b=1&c=2",
  footnote: "5 > 3 & 2 < 4",
});
check("no script tag survives", nasty.includes("<script>"), false);
check("ampersands are entities", nasty.includes("O&#39;Brien &amp;"), true);
check("injected markup is inert", nasty.includes("<b>now</b>"), false);
check("quotes in meta can't break an attribute", nasty.includes('it&#39;s &quot;fine&quot;'), true);
check("the href is escaped too", nasty.includes("b=1&amp;c=2"), true);
check("footnote comparisons survive", nasty.includes("5 &gt; 3 &amp; 2 &lt; 4"), true);

console.log("\nemail structure the clients demand");
const sample = renderEmailHtml({
  title: "$250 due tomorrow",
  paragraphs: ["Last day to pay."],
  heroAmount: "$250",
  heroLabel: "Amount due",
  ctaLabel: "Open your dues",
  ctaHref: "https://example.org/member/dues",
  preheader: "$250 due tomorrow.",
});
// Outlook renders through Word: no flexbox, no grid, and padding on an anchor
// is dropped — hence the VML rectangle.
check("no flexbox or grid", /display\s*:\s*(flex|grid)/.test(sample), false);
check("VML button for Outlook", sample.includes("v:roundrect") && sample.includes("w:anchorlock"), true);
check("tables carry the layout", sample.split("<table").length - 1 >= 4, true);
check("fixed 600px shell", sample.includes('width="600"'), true);
check("no external assets to be blocked", /(src=|url\()https?:\/\//.test(sample), false);
check("no <style> block for Gmail to strip", sample.toLowerCase().includes("<style"), false);
check("a preheader, so previews aren't all identical", sample.includes("display:none;max-height:0"), true);
// Gmail clips at 102KB and hides everything after, including the unsubscribe.
check("well under Gmail's clipping limit", Buffer.byteLength(sample) < 102400, true);
// A missing text part is a well-known spam signal.
const text = renderEmailText({ title: "T", paragraphs: ["p"], ctaLabel: "Go", ctaHref: "https://x.org" });
check("plain text carries the link", text.includes("https://x.org"), true);
check("and has no markup in it", /<[a-z]/i.test(text), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
