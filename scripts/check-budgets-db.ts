// scripts/check-budgets-db.ts
// Committee budget checks against a real database: the whole cycle, from
// opening a term to closing it, through the same service functions the
// routes call.
//
//   npm run check:budgets-db
//
// Uses a far-future term (Fall 2099) and two throwaway committees, and deletes
// everything it created in a finally. Notifications are switched off.
process.env.BUDGET_NOTIFY_DISABLED = "1";

import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import Committee from "@/lib/models/Committee";
import BudgetTerm from "@/lib/models/BudgetTerm";
import BudgetProposal from "@/lib/models/BudgetProposal";
import BudgetPackage from "@/lib/models/BudgetPackage";
import CommitteeBudget from "@/lib/models/CommitteeBudget";
import BudgetEntry from "@/lib/models/BudgetEntry";
import BudgetEvent from "@/lib/models/BudgetEvent";
import Reimbursement from "@/lib/models/Reimbursement";
import FinanceEvent from "@/lib/models/FinanceEvent";
import { BudgetViewer } from "@/lib/budgetAuth";
import { setTermWindow, writeProposal, returnProposal, listProposals } from "@/lib/budgetProposals";
import { createPackage, recordVoteResult, setFinalDues, serializePackage } from "@/lib/budgetPackages";
import { addEntry, addLine, archiveLine, loadBudget, reverseEntry, totalsFor } from "@/lib/budgetLedger";
import { submitRequest, reviewRequest, payRequest, retagRequest, withdrawOrRelease, editRequest } from "@/lib/budgetRequests";
import { closeBudget, closePreview, exportTermCsv, reconcileBudgets } from "@/lib/budgetClose";

const TERM = "Fall 2099";
const NEXT = "Spring 2100";
const TAG = "ZZTEST Budget";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
async function refuses(name: string, fn: () => Promise<any>, contains: string) {
  try {
    await fn();
    check(`${name} (refused)`, "allowed", `refused: ${contains}`);
  } catch (err: any) {
    const ok = String(err?.message ?? "").includes(contains) && err?.statusCode >= 400 && err?.statusCode < 500;
    check(`${name} (refused)`, ok ? "refused" : `${err?.statusCode}: ${err?.message}`, "refused");
  }
}

async function cleanup() {
  const committees = await Committee.find({ name: { $regex: `^${TAG}` } }).select("_id").lean<any[]>();
  const ids = committees.map((c) => c._id);
  const requests = await Reimbursement.find({ committeeId: { $in: ids } }).select("_id").lean<any[]>();
  await Promise.all([
    BudgetTerm.deleteMany({ term: { $in: [TERM, NEXT] } }),
    BudgetProposal.deleteMany({ term: { $in: [TERM, NEXT] } }),
    BudgetPackage.deleteMany({ term: { $in: [TERM, NEXT] } }),
    CommitteeBudget.deleteMany({ term: { $in: [TERM, NEXT] } }),
    BudgetEntry.deleteMany({ term: { $in: [TERM, NEXT] } }),
    BudgetEvent.deleteMany({ term: { $in: [TERM, NEXT] } }),
    FinanceEvent.deleteMany({ "refs.reimbursementId": { $in: requests.map((r) => r._id) } }),
    Reimbursement.deleteMany({ committeeId: { $in: ids } }),
  ]);
  await Committee.deleteMany({ _id: { $in: ids } });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  await cleanup(); // a previous run that died halfway

  const member = await Member.findOne({ status: "Active" }).select("_id rollNo fName lName").lean<any>();
  if (!member) throw new Error("no active member to test against");
  const head: BudgetViewer = { _id: member._id, rollNo: member.rollNo, fName: member.fName, lName: member.lName, isTreasury: false };
  const treasurer: BudgetViewer = { ...head, isTreasury: true };
  console.log(`\ntesting as member ${member.rollNo}, term ${TERM}\n`);

  try {
    const [rush, bro] = await Committee.insertMany([
      { name: `${TAG} Rush`, committeeHeadId: member._id },
      { name: `${TAG} Brotherhood`, committeeHeadId: member._id },
    ]);
    const R = String(rush._id), B = String(bro._id);

    console.log("term window");
    await refuses("head can't file before the term opens", () => writeProposal(head, { term: TERM, committeeParam: R, lines: [], expectedIncomeCents: 0, intent: "save" }), "haven't opened");
    await refuses("a head can't open a term", () => setTermWindow(head, TERM, "open"), "treasury");
    check("treasurer opens it", (await setTermWindow(treasurer, TERM, "open")).proposalsOpen, true);
    await refuses("can't open twice", () => setTermWindow(treasurer, TERM, "open"), "already open");

    console.log("\nproposals");
    let p = await writeProposal(head, { term: TERM, committeeParam: R, lines: [{ name: "Food", amountCents: 30000 }, { name: "Venue", amountCents: 20000 }], expectedIncomeCents: 5000, intent: "save" });
    check("draft saved at version 1", [p.status, p.version, p.totalCents], ["draft", 1, 50000]);
    p = await writeProposal(head, { term: TERM, committeeParam: R, lines: [{ _id: p.lines[0]._id, name: "Food", amountCents: 35000 }, { _id: p.lines[1]._id, name: "Venue", amountCents: 20000 }], expectedIncomeCents: 5000, intent: "save", expectedVersion: 1 });
    check("draft overwrite keeps version and history empty", [p.version, p.history.length], [1, 0]);
    p = await writeProposal(head, { term: TERM, committeeParam: R, lines: p.lines, expectedIncomeCents: 5000, intent: "submit", expectedVersion: 1 });
    check("submitting the draft is still version 1", [p.status, p.version, p.history.length], ["submitted", 1, 0]);
    await refuses("draft save over a submitted proposal", () => writeProposal(head, { term: TERM, committeeParam: R, lines: p.lines, expectedIncomeCents: 0, intent: "save" }), "Already submitted");
    await refuses("treasurer edit needs a reason", () => writeProposal(treasurer, { term: TERM, committeeParam: R, lines: p.lines, expectedIncomeCents: 5000, intent: "edit" }), "Say why");
    await refuses("stale version is refused", () => writeProposal(treasurer, { term: TERM, committeeParam: R, lines: p.lines, expectedIncomeCents: 5000, intent: "edit", expectedVersion: 9, reason: "x" }), "changed while");
    p = await writeProposal(treasurer, { term: TERM, committeeParam: R, lines: [{ _id: p.lines[0]._id, name: "Food", amountCents: 30000 }, { _id: p.lines[1]._id, name: "Venue", amountCents: 20000 }], expectedIncomeCents: 5000, intent: "edit", expectedVersion: 1, reason: "Food is capped at $300" });
    check("treasurer edit archives v1, becomes v2", [p.version, p.history.length, p.history[0].version, p.totalCents], [2, 1, 1, 50000]);
    check("history explains the change", p.history[0].changeSummary, "Food $350 to $300");
    p = await returnProposal(treasurer, TERM, R, "Add a line for shirts");
    check("returned", [p.status, p.reviewNote], ["returned", "Add a line for shirts"]);
    p = await writeProposal(head, { term: TERM, committeeParam: R, lines: [...p.lines, { name: "Shirts", amountCents: 10000 }], expectedIncomeCents: 5000, intent: "submit", expectedVersion: 2 });
    check("resubmitted at v3", [p.status, p.version, p.history.length, p.totalCents], ["submitted", 3, 2, 60000]);

    await writeProposal(head, { term: TERM, committeeParam: B, lines: [{ name: "Retreat", amountCents: 40000 }], expectedIncomeCents: 0, intent: "submit" });
    const chapter = await writeProposal(treasurer, { term: TERM, committeeParam: "chapter", lines: [{ name: "Nationals", amountCents: 200000 }, { name: "Insurance", amountCents: 100000 }], expectedIncomeCents: 0, intent: "submit" });
    check("chapter costs", chapter.totalCents, 300000);
    const list = await listProposals(treasurer, TERM);
    const ours = list.rows.filter((r) => !r.committee || r.committee.name.startsWith(TAG));
    check("treasury sees both committees and chapter costs", ours.length, 3);

    console.log("\npackage, vote, dues");
    let pkg = await createPackage(treasurer, { term: TERM, kind: "term" });
    const ourItems = pkg.items.filter((i) => i.committeeName.startsWith(TAG) || i.committeeName === "Chapter costs");
    check("package froze our three proposals", ourItems.length, 3);
    check("rush frozen at v3", pkg.items.find((i) => i.committeeId === R)?.version, 3);
    await refuses("a second term package is refused", () => createPackage(treasurer, { term: TERM, kind: "term" }), "already an open");
    await refuses("proposal is locked while voting", async () => {
      const { openAppVote } = await import("@/lib/budgetPackages");
      await openAppVote(treasurer, pkg._id);
      await returnProposal(treasurer, TERM, R, "too late");
    }, "being voted on");
    const { cancelVote } = await import("@/lib/budgetPackages");
    pkg = await cancelVote(treasurer, pkg._id);
    check("vote cancelled back to draft", pkg.status, "draft");
    await refuses("tie fails", async () => {
      const result = await recordVoteResult(treasurer, pkg._id, { yes: 0, no: 0 });
      return result;
    }, "Enter the vote count");
    pkg = await recordVoteResult(treasurer, pkg._id, { yes: 30, no: 4, abstain: 2, date: "2099-08-25", note: "Chapter meeting" });
    check("approved", pkg.status, "approved");
    check("every item applied", pkg.items.every((i) => i.applied), true);
    pkg = await setFinalDues(treasurer, pkg._id, (pkg.suggestedDuesCents ?? 0) + 500);
    check("final dues set above the suggestion", pkg.finalDuesCents, (pkg.suggestedDuesCents ?? 0) + 500);
    check("coverage is a surplus", (pkg.coverageCents ?? -1) >= 0, true);

    const rushBudget = await loadBudget(rush._id, TERM);
    const broBudget = await loadBudget(bro._id, TERM);
    let rt = await totalsFor(rushBudget);
    check("rush budget created with its three lines", rushBudget.lines.map((l: any) => l.name), ["Food", "Venue", "Shirts"]);
    check("rush funded from the voted version", rt.fundedCents, 60000);
    check("proposal marked approved", (await BudgetProposal.findOne({ term: TERM, committeeId: rush._id }).lean<any>()).status, "approved");
    const food = rushBudget.lines[0]._id, venue = rushBudget.lines[1]._id, shirts = rushBudget.lines[2]._id;

    console.log("\ntreasurer money tools");
    await addEntry(treasurer, { kind: "income", budgetId: rushBudget._id, lineId: food, amountCents: 2500, note: "Bake sale" });
    await addEntry(treasurer, { kind: "direct_spend", budgetId: rushBudget._id, lineId: venue, amountCents: 4000, note: "Room deposit on chapter card" });
    const move = await addEntry(treasurer, { kind: "transfer", budgetId: rushBudget._id, lineId: food, toBudgetId: broBudget._id, toLineId: null, amountCents: 5000, note: "Brotherhood ran short" });
    await refuses("can't move more than is free", () => addEntry(treasurer, { kind: "transfer", budgetId: rushBudget._id, lineId: venue, toLineId: food, amountCents: 999999 }), "is free on that line");
    await refuses("adjustment needs a reason", () => addEntry(treasurer, { kind: "adjustment", budgetId: rushBudget._id, lineId: food, amountCents: 1000 }), "Say why");
    rt = await totalsFor(rushBudget);
    let bt = await totalsFor(broBudget);
    check("rush after income, spend and transfer", [rt.fundedCents, rt.spentCents, rt.availableCents], [57500, 4000, 53500]);
    check("brotherhood received it", bt.fundedCents, 45000);
    await reverseEntry(treasurer, move._id, "Wrong committee");
    rt = await totalsFor(rushBudget);
    bt = await totalsFor(broBudget);
    check("reversing the transfer restores both sides", [rt.fundedCents, bt.fundedCents], [62500, 40000]);
    await refuses("can't reverse twice", () => reverseEntry(treasurer, move._id, "again"), "already reversed");
    const decorId = await addLine(treasurer, rushBudget._id, "Decor");
    await addEntry(treasurer, { kind: "transfer", budgetId: rushBudget._id, lineId: food, toLineId: decorId, amountCents: 1500, note: "Reallocate" });
    await archiveLine(treasurer, rushBudget._id, decorId);
    rt = await totalsFor(await loadBudget(rush._id, TERM));
    check("archiving a line moves its money to Unassigned", rt.lines[""].availableCents, 1500);

    console.log("\nrequests");
    const outsider: BudgetViewer = { ...head, _id: new mongoose.Types.ObjectId() };
    await refuses("only the head can file", () => submitRequest(outsider, { committeeId: R, term: TERM, kind: "claim", amountCents: 100, description: "x", purchasedOn: "2099-09-01", receiptUrls: ["a"] }), "head and the treasury");
    await refuses("claims need a receipt", () => submitRequest(head, { committeeId: R, term: TERM, kind: "claim", lineId: food, amountCents: 100, description: "x", purchasedOn: "2026-09-01" }), "receipt");
    const pre = (await submitRequest(head, { committeeId: R, term: TERM, kind: "preapproval", lineId: shirts, amountCents: 8000, description: "Rush shirts" })).request;
    await reviewRequest(treasurer, pre._id, { action: "approve" });
    rt = await totalsFor(rushBudget);
    check("approved pre-approval holds money", rt.lines[String(shirts)].heldCents, 8000);
    const shirtClaim = (await submitRequest(head, { committeeId: R, term: TERM, kind: "claim", preapprovalId: pre._id, amountCents: 7600, description: "Rush shirts", purchasedOn: "2026-09-01", receiptUrls: ["receipts/a.jpg"] })).request;
    check("claim lands on the pre-approval's line", shirtClaim.lineId, String(shirts));
    await refuses("partial approval needs a note", () => reviewRequest(treasurer, shirtClaim._id, { action: "approve", approvedCents: 7000 }), "note is required");
    const approvedShirt = await reviewRequest(treasurer, shirtClaim._id, { action: "approve", approvedCents: 7000, note: "Shipping isn't covered" });
    check("partial approval", [approvedShirt.status, approvedShirt.approvedCents, approvedShirt.payout.status], ["approved", 7000, "unpaid"]);
    check("pre-approval fulfilled", (await Reimbursement.findById(pre._id).lean<any>()).status, "fulfilled");
    rt = await totalsFor(rushBudget);
    check("shirts: spent 7000, nothing held", [rt.lines[String(shirts)].spentCents, rt.lines[String(shirts)].heldCents], [7000, 0]);

    const big = (await submitRequest(head, { committeeId: R, term: TERM, kind: "claim", lineId: food, amountCents: 900000, description: "Huge dinner", purchasedOn: "2026-09-02", receiptUrls: ["receipts/b.jpg"] }));
    check("submit warns when it would go over", big.overBudget.needsOverride, true);
    await refuses("over budget needs an override", () => reviewRequest(treasurer, big.request._id, { action: "approve" }), "needs an override");
    const returned = await reviewRequest(treasurer, big.request._id, { action: "return", note: "Split this up" });
    check("sent back", returned.status, "returned");
    const fixed = await editRequest(head, big.request._id, { amountCents: 12000 });
    check("head fixes and resubmits", [fixed.status, fixed.amountCents, fixed.revision], ["pending", 12000, 1]);
    await reviewRequest(treasurer, big.request._id, { action: "approve" });
    const paid = await payRequest(treasurer, big.request._id, { method: "venmo", reference: "@rush-head" });
    check("paid by Venmo", [paid.request.payout.status, paid.request.payout.method], ["paid", "venmo"]);
    await refuses("can't pay twice", () => payRequest(treasurer, big.request._id, { method: "cash" }), "already paid");

    const moved = await retagRequest(treasurer, shirtClaim._id, { committeeId: B, lineId: null, note: "Shirts were for brotherhood" }).catch((e) => e);
    check("a claim tied to a pre-approval can't be moved on its own", String(moved?.message ?? "").includes("pre-approval"), true);
    const stray = (await submitRequest(head, { committeeId: R, term: TERM, kind: "claim", lineId: food, amountCents: 3000, description: "Retreat snacks", purchasedOn: "2026-09-03", receiptUrls: ["receipts/c.jpg"] })).request;
    await reviewRequest(treasurer, stray._id, { action: "approve" });
    const before = (await totalsFor(broBudget)).spentCents;
    const re = await retagRequest(treasurer, stray._id, { committeeId: B, lineId: null, note: "Filed under the wrong committee" });
    check("re-tagged to brotherhood", re.committeeName, `${TAG} Brotherhood`);
    check("spending moved with it", (await totalsFor(broBudget)).spentCents - before, 3000);

    const pending = (await submitRequest(head, { committeeId: R, term: TERM, kind: "claim", lineId: food, amountCents: 500, description: "Ice", purchasedOn: "2026-09-04", receiptUrls: ["receipts/d.jpg"] })).request;
    const hold = (await submitRequest(head, { committeeId: R, term: TERM, kind: "preapproval", lineId: food, amountCents: 2000, description: "Speaker gift" })).request;
    await reviewRequest(treasurer, hold._id, { action: "approve" });

    console.log("\nclose");
    await refuses("can't close with pending requests", () => closeBudget(treasurer, { budgetId: String(rushBudget._id), carryCents: 0 }), "pending request");
    await withdrawOrRelease(head, pending._id, "withdraw");
    const preview = (await closePreview(TERM)).rows.find((r) => r.committeeId === R)!;
    rt = await totalsFor(rushBudget);
    check("preview counts the hold as leftover", preview.leftoverCents, rt.availableCents + rt.heldCents);
    const closed = await closeBudget(treasurer, { budgetId: String(rushBudget._id), carryCents: 10000 });
    check("carried and returned add up", (closed.carriedCents ?? 0) + (closed.returnedCents ?? 0), preview.leftoverCents);
    check("hold released at close", (await Reimbursement.findById(hold._id).lean<any>()).status, "released");
    const rushAfter = await totalsFor(rushBudget);
    check("closed budget ends at zero available", rushAfter.availableCents, 0);
    const next = await loadBudget(rush._id, NEXT);
    check("next term budget starts with the carryover", (await totalsFor(next)).fundedCents, 10000);
    await refuses("closed budgets take no new money", () => addEntry(treasurer, { kind: "income", budgetId: rushBudget._id, amountCents: 100 }), "closed");

    console.log("\nnext term package picks up the carryover");
    const { carryoverInto } = await import("@/lib/budgetPackages");
    check("carryover into next term", await carryoverInto(NEXT), 10000);

    console.log("\naudit");
    const report = await reconcileBudgets(new Date());
    check("reconcile finds nothing to repair", [report.packagesFinished, report.reviewGaps, report.entryGaps], [0, 0, 0]);
    const types = new Set((await BudgetEvent.find({ term: TERM }).select("type").lean<any[]>()).map((e) => e.type));
    for (const t of ["term_opened", "proposal_submitted", "proposal_edited", "proposal_returned", "proposal_resubmitted", "chapter_costs_set", "package_created", "vote_opened", "vote_cancelled", "vote_recorded", "package_approved", "dues_suggested", "dues_amount_set", "budget_created", "budget_allocated", "income_recorded", "direct_spend_recorded", "transfer_out", "transfer_in", "entry_reversed", "line_added", "lines_reallocated", "line_archived", "preapproval_requested", "preapproval_approved", "claim_submitted", "claim_partially_approved", "claim_returned", "claim_resubmitted", "claim_approved", "payout_recorded", "expense_retagged", "claim_withdrawn", "preapproval_released", "rollover_carried", "rollover_returned", "budget_closed"]) {
      check(`logged ${t}`, types.has(t), true);
    }
    const csv = await exportTermCsv(TERM);
    check("export has the summary and the log", csv.includes(`${TAG} Rush`) && csv.includes("Action log"), true);
    const pkgDoc = await serializePackage(await BudgetPackage.findById(pkg._id).lean<any>());
    check("package records the recorded vote", [pkgDoc.approval.method, pkgDoc.approval.yes, pkgDoc.approval.no], ["recorded", 30, 4]);
  } finally {
    // Delete the in-app vote the lock test opened, if any.
    const pkgs = await BudgetPackage.find({ term: { $in: [TERM, NEXT] } }).select("approval.voteId").lean<any[]>();
    const Vote = (await import("@/lib/models/Vote")).default;
    await Vote.deleteMany({ title: { $in: [`${TERM} budget`] }, votes: { $size: 0 } });
    void pkgs;
    await cleanup();
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
