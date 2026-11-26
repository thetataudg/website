// Pure-logic checks for committee budgets. Run with `npm run check:budgets`.
import {
  UNASSIGNED,
  computeBudgetTotals,
  cancelledEntryIds,
  percentUsed,
  thresholdsCrossed,
  checkOverBudget,
  releasableHoldCents,
  canTransition,
  validateReview,
  validateMove,
  leftoverCents,
  normalizeProposalLines,
  proposalTotalCents,
  diffProposalLines,
  diffIsEmpty,
  suggestDuesCents,
  duesCoverageCents,
  voteCarries,
  calendarDayAtPhoenixNoon,
  EntryLike,
  RequestLike,
} from "@/lib/budgets";

let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// One committee budget B with two lines, and a second budget C that receives
// a transfer. Every number below is worked out by hand in the comments.
const B = "budgetB", C = "budgetC", L1 = "lineFood", L2 = "lineVenue", CL = "lineC";

const entries: EntryLike[] = [
  { _id: "e1", kind: "allocation", budgetId: B, lineId: L1, amountCents: 30000 },
  { _id: "e2", kind: "allocation", budgetId: B, lineId: L2, amountCents: 20000 },
  { _id: "e3", kind: "allocation", budgetId: B, lineId: null, amountCents: 5000 },
  { _id: "e4", kind: "income", budgetId: B, lineId: L1, amountCents: 2500 },
  { _id: "e5", kind: "direct_spend", budgetId: B, lineId: L2, amountCents: 4000 },
  { _id: "e6", kind: "transfer", from: { budgetId: B, lineId: L1 }, to: { budgetId: C, lineId: CL }, amountCents: 5000 },
  { _id: "e7", kind: "transfer", from: { budgetId: B, lineId: null }, to: { budgetId: B, lineId: L2 }, amountCents: 3000 },
  { _id: "e8", kind: "adjustment", budgetId: B, lineId: L1, amountCents: -1000 },
  { _id: "e9", kind: "allocation", budgetId: B, lineId: L1, amountCents: 99999 },
  { _id: "e10", kind: "reversal", reversesEntryId: "e9", amountCents: 99999 },
];

const requests: RequestLike[] = [
  { _id: "r1", kind: "claim", budgetId: B, lineId: L1, status: "approved", amountCents: 10000, approvedCents: 8000 },
  { _id: "r2", kind: "claim", budgetId: B, lineId: L2, status: "pending", amountCents: 1500 },
  { _id: "r3", kind: "preapproval", budgetId: B, lineId: L1, status: "approved", amountCents: 6000, approvedCents: 6000 },
  { _id: "r4", kind: "claim", budgetId: B, lineId: L1, status: "approved", amountCents: 2500, approvedCents: 2500, preapprovalId: "r3" },
  { _id: "r5", kind: "claim", budgetId: B, lineId: L1, status: "denied", amountCents: 9999 },
  { _id: "r6", kind: "preapproval", budgetId: B, lineId: L2, status: "pending", amountCents: 2000 },
  { _id: "r7", kind: "claim", budgetId: C, lineId: CL, status: "approved", amountCents: 777, approvedCents: 777 },
];

const t = computeBudgetTotals(B, entries, requests, [L1, L2]);

console.log("\nreversals");
check("a reversal cancels itself and its target", [...cancelledEntryIds(entries)].sort(), ["e10", "e9"]);

console.log("\nper line");
// Food: 30000 + 2500 income - 5000 transferred out - 1000 adjustment = 26500 funded.
// Spent 8000 (partial approval of r1) + 2500 (r4). Held 6000 - 2500 used = 3500.
check("food funded", t.lines[L1].fundedCents, 26500);
check("food spent counts approvedCents, not requested", t.lines[L1].spentCents, 10500);
check("food held is the pre-approval less what its claim used", t.lines[L1].heldCents, 3500);
check("food available", t.lines[L1].availableCents, 12500);
// Venue: 20000 + 3000 reallocated in = 23000. Spent 4000 direct. Pending 1500 + 2000.
check("venue funded includes the reallocation", t.lines[L2].fundedCents, 23000);
check("venue direct spend counts as spent", t.lines[L2].spentCents, 4000);
check("venue pending is shown", t.lines[L2].pendingCents, 3500);
check("pending is never subtracted", t.lines[L2].availableCents, 19000);
// Unassigned: 5000 - 3000 moved to venue.
check("unassigned keeps what wasn't moved", t.lines[UNASSIGNED].availableCents, 2000);

console.log("\nwhole budget");
check("funded", t.fundedCents, 51500);
check("spent", t.spentCents, 14500);
check("held", t.heldCents, 3500);
check("pending", t.pendingCents, 3500);
check("available", t.availableCents, 33500);
check("lines sum to the total", Object.values(t.lines).reduce((s, l) => s + l.availableCents, 0), t.availableCents);
check("other budget's claim is ignored", t.spentCents, 14500);

console.log("\ntransfers have two sides");
const c = computeBudgetTotals(C, entries, requests);
check("receiving budget is funded by the transfer", c.lines[CL].fundedCents, 5000);
check("receiving budget spends its own claim", c.lines[CL].spentCents, 777);
check("money is conserved across B and C",
  t.fundedCents + c.fundedCents,
  30000 + 20000 + 5000 + 2500 - 1000);

console.log("\na line with no activity still shows");
check("seeded empty line", computeBudgetTotals(B, [], [], ["empty"]).lines["empty"].availableCents, 0);

console.log("\nfulfilled and released pre-approvals hold nothing");
check("fulfilled", computeBudgetTotals(B, [], [{ _id: "p", kind: "preapproval", budgetId: B, status: "fulfilled", amountCents: 5000, approvedCents: 5000 }]).heldCents, 0);
check("released", computeBudgetTotals(B, [], [{ _id: "p", kind: "preapproval", budgetId: B, status: "released", amountCents: 5000, approvedCents: 5000 }]).heldCents, 0);
check("a claim larger than its pre-approval doesn't make held negative",
  computeBudgetTotals(B, [], [
    { _id: "p", kind: "preapproval", budgetId: B, status: "approved", amountCents: 1000, approvedCents: 1000 },
    { _id: "q", kind: "claim", budgetId: B, status: "approved", amountCents: 1500, approvedCents: 1500, preapprovalId: "p" },
  ]).heldCents, 0);

console.log("\npercent used and thresholds");
check("held counts as used", percentUsed(t), 34); // (14500 + 3500) / 51500
check("nothing funded -> null", percentUsed({ fundedCents: 0, spentCents: 0, heldCents: 0, pendingCents: 0, availableCents: 0 }), null);
const at = (spent: number) => ({ fundedCents: 10000, spentCents: spent, heldCents: 0, pendingCents: 0, availableCents: 10000 - spent });
check("70% -> 85% crosses 80", thresholdsCrossed(at(7000), at(8500)), [80]);
check("already sent 80 -> nothing", thresholdsCrossed(at(7000), at(8500), [80]), []);
check("one jump past both", thresholdsCrossed(at(7000), at(10000)), [80, 100]);
check("going down crosses nothing", thresholdsCrossed(at(9000), at(5000)), []);

console.log("\nover budget");
check("line short but committee fine -> warning only",
  checkOverBudget(t, L2, 20000),
  { lineShortCents: 1000, committeeShortCents: 0, needsOverride: false, lineWarning: true });
check("committee goes negative -> override",
  checkOverBudget(t, L1, 40000),
  { lineShortCents: 27500, committeeShortCents: 6500, needsOverride: true, lineWarning: false });
check("exactly to zero needs no override", checkOverBudget(t, L1, 33500).needsOverride, false);
check("hold left on r3", releasableHoldCents(requests[2], requests), 3500);
check("a claim against a pre-approval doesn't double count its hold",
  checkOverBudget(t, L1, 15000, 3500),
  { lineShortCents: 0, committeeShortCents: 0, needsOverride: false, lineWarning: false });
check("a pending pre-approval releases nothing", releasableHoldCents(requests[5], requests), 0);

console.log("\nstate machine");
check("treasurer approves a pending claim", canTransition("claim", "pending", "approved", "treasurer"), true);
check("a head can't approve their own", canTransition("claim", "pending", "approved", "head"), false);
check("head resubmits after send-back", canTransition("claim", "returned", "pending", "head"), true);
check("an approved claim is final", canTransition("claim", "approved", "pending", "treasurer"), false);
check("head releases their own hold", canTransition("preapproval", "approved", "released", "head"), true);
check("claims have no 'released'", canTransition("claim", "approved", "released", "treasurer"), false);

console.log("\nreview");
const fine = checkOverBudget(t, L1, 1000);
const over = checkOverBudget(t, L1, 40000);
check("approve in full", validateReview({ action: "approve", requestedCents: 1000 }, fine),
  { ok: true, status: "approved", approvedCents: 1000, partial: false });
check("partial needs a note", validateReview({ action: "approve", requestedCents: 10000, approvedCents: 8000 }, fine).ok, false);
check("partial with a note", validateReview({ action: "approve", requestedCents: 10000, approvedCents: 8000, note: "No tip" }, fine),
  { ok: true, status: "approved", approvedCents: 8000, partial: true });
check("can't approve more than asked", validateReview({ action: "approve", requestedCents: 1000, approvedCents: 1001 }, fine).ok, false);
check("can't approve zero", validateReview({ action: "approve", requestedCents: 1000, approvedCents: 0 }, fine).ok, false);
check("over budget without override is refused", validateReview({ action: "approve", requestedCents: 40000 }, over).ok, false);
check("over budget with override", validateReview({ action: "approve", requestedCents: 40000, overrideConfirmed: true }, over).status, "approved");
check("deny needs a note", validateReview({ action: "deny", requestedCents: 1000 }, null).ok, false);
check("send back with a note", validateReview({ action: "return", requestedCents: 1000, note: "Receipt is blurry" }, null).status, "returned");

console.log("\nmoving money");
check("can move what's free", validateMove(t, L1, 12500), null);
check("can't move held money", validateMove(t, L1, 13000), "Only $125 is free on that line");
check("zero is refused", validateMove(t, L1, 0), "Amount must be greater than zero");
check("leftover never negative", leftoverCents({ fundedCents: 0, spentCents: 500, heldCents: 0, pendingCents: 0, availableCents: -500 }), 0);
check("leftover is available", leftoverCents(t), 33500);

console.log("\nproposal lines");
const good = normalizeProposalLines([{ name: " Food ", amountCents: 12000, reason: "Two socials" }, { name: "Venue", amountCents: 0 }]);
check("trims and keeps zero lines", good, { lines: [{ name: "Food", amountCents: 12000, reason: "Two socials" }, { name: "Venue", amountCents: 0, reason: "" }], error: null });
check("total", proposalTotalCents(good.lines), 12000);
check("duplicate names refused", normalizeProposalLines([{ name: "Food", amountCents: 1 }, { name: "food", amountCents: 2 }]).error, "\"food\" is listed twice");
check("negative refused", normalizeProposalLines([{ name: "Food", amountCents: -1 }]).error, "\"Food\" needs a whole-cent amount of zero or more");
check("fractional cents refused", normalizeProposalLines([{ name: "Food", amountCents: 10.5 }]).error, "\"Food\" needs a whole-cent amount of zero or more");
check("blank name refused", normalizeProposalLines([{ name: "  ", amountCents: 1 }]).error, "Every line needs a name");
check("not a list", normalizeProposalLines("nope").error, "lines must be a list");

console.log("\nproposal diff");
const d = diffProposalLines(
  [{ _id: "a", name: "Food", amountCents: 10000 }, { _id: "b", name: "Venue", amountCents: 5000 }, { name: "Decor", amountCents: 2000 }],
  [{ _id: "a", name: "Food & drink", amountCents: 12000 }, { name: "Decor", amountCents: 2000 }, { name: "Shirts", amountCents: 3000 }]
);
check("added", d.added, [{ name: "Shirts", amountCents: 3000 }]);
check("removed", d.removed, [{ name: "Venue", amountCents: 5000 }]);
check("changed", d.changed, [{ name: "Food & drink", fromCents: 10000, toCents: 12000 }]);
check("renamed by id", d.renamed, [{ from: "Food", to: "Food & drink" }]);
check("identical is empty", diffIsEmpty(diffProposalLines([{ name: "A", amountCents: 1 }], [{ name: "A", amountCents: 1 }])), true);

console.log("\ndues suggestion");
// $10,000 budget - $500 income - $250 carryover = $9,250 across 60 = $154.17, up to $155.
const pkg = { totalCents: 1000000, expectedIncomeCents: 50000, carryoverCents: 25000, activeCount: 60 };
check("rounds up to the dollar", suggestDuesCents(pkg), 15500);
check("surplus at the suggestion", duesCoverageCents(pkg, 15500), 5000);
check("shortfall if lowered", duesCoverageCents(pkg, 15000), -25000);
check("even amount stays even", suggestDuesCents({ totalCents: 600000, activeCount: 60 }), 10000);
check("income covers it all", suggestDuesCents({ totalCents: 1000, expectedIncomeCents: 5000, activeCount: 10 }), 0);
check("nobody to split across", suggestDuesCents({ totalCents: 1000, activeCount: 0 }), null);

console.log("\nvote");
check("majority carries", voteCarries(10, 9), true);
check("tie fails", voteCarries(9, 9), false);

console.log("\ncalendar days");
check("a picked day stays that day in Phoenix", calendarDayAtPhoenixNoon("2026-11-05")?.toLocaleDateString("en-US", { timeZone: "America/Phoenix" }), "11/5/2026");
check("empty is null", calendarDayAtPhoenixNoon(""), null);
check("garbage is null", calendarDayAtPhoenixNoon("nope"), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
