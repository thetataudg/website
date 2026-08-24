// scripts/check-plans-db.ts
// Payment-plan checks that need a real database: the derivation only means
// anything against charges that money has actually landed on.
//
//   npm run check:plans
//
// Writes to the development database under a tagged term and deletes
// everything it created in a finally, whether or not the checks pass.
import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import CreditEntry from "@/lib/models/CreditEntry";
import FinanceEvent from "@/lib/models/FinanceEvent";
import {
  buildSchedule, maxInstallmentsFor, proposalWindowOpen, anchorDueDateFor,
  derivePlanProgress, serializePlan, currentDue, currentPlanFor,
  membersAwaitingPlanReview, activePlansFor, livePlansFor,
  chargeIdsUnderLivePlans, currentDueAcross, planIsFinished,
} from "@/lib/plans";
import { normalizeDueDate } from "@/lib/dues";
import { applyCreditToOpenCharges, creditBalanceCents, mintCredit } from "@/lib/credit";

const TAG = "ZZTEST-PLANS";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
const day = (s: string) => normalizeDueDate(s) as Date;
const reload = async (id: any) => DuesCharge.findById(id).lean<any>();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const member = await Member.findOne({ status: "Active" }).select("_id rollNo").lean<any>();
  if (!member) throw new Error("no active member to test against");
  console.log(`\ntesting against member ${member.rollNo}, tag ${TAG}\n`);

  try {
    // --- proposing --------------------------------------------------------
    const charge = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} dues`,
      category: "dues", amountCents: 25000, dueDate: day("2026-09-01"), status: "open",
    });
    let doc = await reload(charge._id);

    console.log("proposing");
    check("balance is what a plan would cover", balanceCentsFor(doc), 25000);
    check("$250 splits eight ways at most", maxInstallmentsFor(balanceCentsFor(doc)), 8);
    check("anchor is the charge's own due date", anchorDueDateFor([doc])?.toISOString(), "2026-09-01T00:00:00.000Z");
    check("window open the day before", proposalWindowOpen([doc], new Date("2026-08-31T12:00:00.000Z")), true);
    check("window shut the day after", proposalWindowOpen([doc], new Date("2026-09-03T12:00:00.000Z")), false);

    const schedule = buildSchedule(25000, 3, doc.dueDate);
    const plan = await PaymentPlan.create({
      memberId: member._id, term: TAG, chargeIds: [charge._id],
      totalCents: 25000, baselinePaidCents: 0, installments: schedule,
      proposedAt: new Date("2026-08-30T12:00:00.000Z"),
      proposedAgainstDueDate: doc.dueDate, status: "pending",
      requestNote: `${TAG} note`,
    });

    console.log("\npersistence round trip");
    let planDoc = await PaymentPlan.findById(plan._id).lean<any>();
    check("three installments stored", planDoc.installments.length, 3);
    check("amounts survive mongo", planDoc.installments.map((i: any) => i.amountCents), [8334, 8333, 8333]);
    check("dates survive mongo", planDoc.installments.map((i: any) => new Date(i.dueDate).toISOString()), ["2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
    check("they still sum to the penny", planDoc.installments.reduce((s: number, i: any) => s + i.amountCents, 0), 25000);

    console.log("\na pending proposal isn't an agreement");
    check("headline stays the full balance", currentDue(planDoc, [doc], 25000, "2026-09-01T00:00:00.000Z", new Date("2026-08-31T12:00:00.000Z")).amountDueNowCents, 25000);
    check("the queue can find it", (await membersAwaitingPlanReview([member._id])).has(String(member._id)), true);
    check("currentPlanFor picks it up", String((await currentPlanFor(member._id))?._id), String(plan._id));

    await PaymentPlan.findByIdAndUpdate(plan._id, { status: "active", reviewedAt: new Date() });
    planDoc = await PaymentPlan.findById(plan._id).lean<any>();

    console.log("\napproved — the headline switches");
    const beforeDue = new Date("2026-08-31T12:00:00.000Z");
    check("this month, not the total", currentDue(planDoc, [doc], 25000, null, beforeDue).amountDueNowCents, 8334);
    check("pointing at the first date", currentDue(planDoc, [doc], 25000, null, beforeDue).dueNowDate, "2026-09-01T00:00:00.000Z");
    check("no longer in the proposal queue", (await membersAwaitingPlanReview([member._id])).has(String(member._id)), false);
    check("but is in the live-plan map", String((await activePlansFor([member._id])).get(String(member._id))?.[0]?._id), String(plan._id));

    console.log("\na treasurer's manual entry advances it with no plan wiring");
    await DuesCharge.findByIdAndUpdate(charge._id, {
      $push: { payments: { amountCents: 4000, method: "venmo", paidOn: day("2026-08-30"), recordedAt: new Date() } },
    });
    doc = await reload(charge._id);
    check("partial leaves the installment short", derivePlanProgress(planDoc, [doc], beforeDue).installments[0].remainingCents, 4334);
    check("and still asks for the remainder", derivePlanProgress(planDoc, [doc], beforeDue).amountDueNowCents, 4334);

    console.log("\na credit application lands mid-plan");
    await mintCredit({ memberId: member._id, amountCents: 10000, note: TAG });
    const applied = await applyCreditToOpenCharges(member._id, null);
    doc = await reload(charge._id);
    check("credit drained into the charge", applied.appliedCents, 10000);
    check("balance moved", balanceCentsFor(doc), 11000);
    // $40 + $100 = $140 against 83.34 / 83.33 / 83.33 — the first is covered and
    // the second is most of the way there.
    check("the plan advanced on its own", derivePlanProgress(planDoc, [doc], beforeDue).installments.map((i: any) => i.status), ["paid", "due", "upcoming"]);
    check("now asking only for what is left of the second", derivePlanProgress(planDoc, [doc], beforeDue).amountDueNowCents, 2667);
    check("plan progress equals money on the charge", derivePlanProgress(planDoc, [doc], beforeDue).paidCents, 14000);

    console.log("\nthe invariant: never owing and holding credit at once");
    check("credit exhausted", await creditBalanceCents(member._id), 0);
    check("balance still owed", balanceCentsFor(doc) > 0, true);

    console.log("\nmissing installments");
    const afterTwo = new Date("2026-10-15T12:00:00.000Z");
    check("the part-paid second installment goes late on its day", derivePlanProgress(planDoc, [doc], afterTwo).missedCount, 1);
    const afterAll = new Date("2026-12-15T12:00:00.000Z");
    check("the last one goes late once its day passes", derivePlanProgress(planDoc, [doc], afterAll).installments[2].status, "late");
    check("two misses flag a conversation", derivePlanProgress(planDoc, [doc], afterAll).shouldDefault, true);
    // Arrears accumulate — $26.67 short on the second plus the whole third — but
    // that is still less than the $110 balance. A miss never accelerates.
    check("arrears accumulate without accelerating the balance", derivePlanProgress(planDoc, [doc], afterAll).amountDueNowCents, 11000);
    // Once every remaining installment is past due, arrears and balance meet —
    // which is the ceiling, not acceleration past it.
    check("arrears never exceed the balance", derivePlanProgress(planDoc, [doc], afterAll).amountDueNowCents <= balanceCentsFor(doc), true);

    console.log("\ncredit arriving larger than the whole plan");
    await mintCredit({ memberId: member._id, amountCents: 20000, note: TAG });
    const second = await applyCreditToOpenCharges(member._id, null);
    doc = await reload(charge._id);
    check("only what was owed got taken", second.appliedCents, 11000);
    check("the rest is held", await creditBalanceCents(member._id), 9000);
    check("balance settled", balanceCentsFor(doc), 0);
    check("plan reads complete", derivePlanProgress(planDoc, [doc], afterAll).isComplete, true);
    check("and asks for nothing", derivePlanProgress(planDoc, [doc], afterAll).amountDueNowCents, 0);
    check("every installment paid", derivePlanProgress(planDoc, [doc], afterAll).installments.map((i: any) => i.status), ["paid", "paid", "paid"]);
    check("headline falls back to the balance", currentDue(planDoc, [doc], 0, null, afterAll).amountDueNowCents, 0);

    console.log("\nthe serializer clients read");
    const dto = serializePlan(planDoc, [doc], afterAll);
    check("keys are stable", Object.keys(dto).sort().join(","), ["_id","amountDueNowCents","chargeIds","createdAt","currentSeq","dueNowDate","graceUntil","installmentCount","installments","memberId","missedCount","paidCents","proposedAgainstDueDate","proposedAt","remainingCents","requestNote","reviewNote","reviewedAt","status","term","totalCents"].join(","));
    check("ids are strings", typeof dto._id === "string" && typeof dto.chargeIds[0] === "string", true);
    check("nothing left owing", dto.remainingCents, 0);
    check("currentSeq clears on completion", dto.currentSeq, null);

    console.log("\na waiver under a live plan");
    const waived = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} waiver`,
      category: "dues", amountCents: 15000, dueDate: day("2026-09-01"), status: "open",
    });
    const wPlan = await PaymentPlan.create({
      memberId: member._id, term: TAG, chargeIds: [waived._id], totalCents: 15000,
      baselinePaidCents: 0, installments: buildSchedule(15000, 3, day("2026-09-01")),
      proposedAt: new Date("2026-08-30T12:00:00.000Z"), status: "active",
    });
    const wPlanDoc = await PaymentPlan.findById(wPlan._id).lean<any>();
    let wDoc = await reload(waived._id);
    check("live and owed", derivePlanProgress(wPlanDoc, [wDoc], afterAll).isComplete, false);
    await DuesCharge.findByIdAndUpdate(waived._id, { status: "waived" });
    wDoc = await reload(waived._id);
    check("waiving completes the plan", derivePlanProgress(wPlanDoc, [wDoc], afterAll).isComplete, true);
    check("unpaid installments read waived, not late", derivePlanProgress(wPlanDoc, [wDoc], afterAll).installments.map((i: any) => i.status), ["waived", "waived", "waived"]);

    console.log("\nvoiding returns credit spent on the charge");
    const before = await creditBalanceCents(member._id);
    await DuesCharge.findByIdAndUpdate(charge._id, { status: "void" });
    check("credit spent on a void charge comes back", (await creditBalanceCents(member._id)) - before, 21000);
    doc = await reload(charge._id);
    check("a void charge is not plan progress", derivePlanProgress(planDoc, [doc], afterAll).paidCents, 0);

    // --- several plans at once -------------------------------------------
    // The scenario: charged $200, put it on a plan; a $500 charge lands later,
    // put that on its own. One plan per charge, not one plan per member.
    console.log("\nmore than one plan at a time");
    const duesA = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} dues A`,
      category: "dues", amountCents: 20000, dueDate: day("2026-09-01"), status: "open",
    });
    const duesB = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} trip deposit`,
      category: "other", amountCents: 50000, dueDate: day("2026-10-01"), status: "open",
    });
    const planA = await PaymentPlan.create({
      memberId: member._id, term: TAG, chargeIds: [duesA._id],
      totalCents: 20000, baselinePaidCents: 0,
      installments: buildSchedule(20000, 2, day("2026-09-01")),
      proposedAt: new Date("2026-08-25T12:00:00.000Z"),
      proposedAgainstDueDate: day("2026-09-01"), status: "active",
    });
    const planB = await PaymentPlan.create({
      memberId: member._id, term: TAG, chargeIds: [duesB._id],
      totalCents: 50000, baselinePaidCents: 0,
      installments: buildSchedule(50000, 2, day("2026-10-01")),
      proposedAt: new Date("2026-09-20T12:00:00.000Z"),
      proposedAgainstDueDate: day("2026-10-01"), status: "active",
    });
    const midway = new Date("2026-09-10T12:00:00.000Z");

    const live = await livePlansFor(member._id);
    const liveIds = live.map((p: any) => String(p._id));
    check("both plans come back live", liveIds.includes(String(planA._id)) && liveIds.includes(String(planB._id)), true);

    const byMember = await activePlansFor([member._id]);
    check("the roster map holds a list", Array.isArray(byMember.get(String(member._id))), true);
    check("with both of them on it", byMember.get(String(member._id))!.length >= 2, true);

    // The conflict set is what stops two schedules claiming the same money.
    let both = await DuesCharge.find({ memberId: member._id }).lean<any[]>();
    let spokenFor = chargeIdsUnderLivePlans([planA.toObject(), planB.toObject()], both, midway);
    check("each plan speaks for its own charge", [spokenFor.has(String(duesA._id)), spokenFor.has(String(duesB._id))], [true, true]);

    // Each plan contributes the installment it is currently on — $100 from A,
    // $250 from B — rather than either plan's whole remaining balance.
    check("the headline sums what each plan asks for now", currentDueAcross([planA.toObject(), planB.toObject()], both, null, midway).amountDueNowCents, 35000);
    check("pointing at the nearer of the two", currentDueAcross([planA.toObject(), planB.toObject()], both, null, midway).dueNowDate, "2026-09-01T00:00:00.000Z");

    // A charge on no plan at all is owed in full alongside the installments.
    const loose = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} fine`,
      category: "other", amountCents: 3000, dueDate: day("2026-09-15"), status: "open",
    });
    both = await DuesCharge.find({ memberId: member._id }).lean<any[]>();
    check("an unplanned charge is added at full balance", currentDueAcross([planA.toObject(), planB.toObject()], both, null, midway).amountDueNowCents, 38000);
    await DuesCharge.findByIdAndDelete(loose._id);

    // Paying A off archives it the moment the money lands — not at the next
    // nightly run, which is what left a finished plan on the member's page.
    console.log("\na finished plan archives itself immediately");
    await DuesCharge.findByIdAndUpdate(duesA._id, {
      $push: { payments: { amountCents: 20000, method: "cash", paidOn: midway, recordedAt: midway } },
    });
    both = await DuesCharge.find({ memberId: member._id }).lean<any[]>();
    const paidA = both.find((c: any) => String(c._id) === String(duesA._id));
    check("its charge is settled", balanceCentsFor(paidA), 0);
    check("stored status still says active", (await PaymentPlan.findById(planA._id).lean<any>()).status, "active");
    check("but it reads as finished", planIsFinished(planA.toObject(), both, midway), true);

    const afterPaid = await livePlansFor(member._id);
    check("and drops out of the live list", afterPaid.map((p: any) => String(p._id)).includes(String(planA._id)), false);
    check("leaving the other one running", afterPaid.map((p: any) => String(p._id)).includes(String(planB._id)), true);

    spokenFor = chargeIdsUnderLivePlans([planA.toObject(), planB.toObject()], both, midway);
    check("its charge is free again", spokenFor.has(String(duesA._id)), false);
    check("the headline drops to the other plan alone", currentDueAcross([planA.toObject(), planB.toObject()], both, null, midway).amountDueNowCents, 25000);
  } finally {
    const charges = await DuesCharge.find({ term: TAG }).select("_id").lean<any[]>();
    const r = await Promise.all([
      DuesCharge.deleteMany({ term: TAG }),
      PaymentPlan.deleteMany({ term: TAG }),
      CreditEntry.deleteMany({ note: TAG }),
      FinanceEvent.deleteMany({ "refs.chargeId": { $in: charges.map((c) => c._id) } }),
    ]);
    console.log(`\ncleaned up: ${r.map((x: any) => x.deletedCount).join(", ")} docs`);
    // Credit entries minted by applyCreditToOpenCharges write finance events
    // keyed on the charge, caught above; anything else tagged goes too.
    await FinanceEvent.deleteMany({ summary: { $regex: TAG } });
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
