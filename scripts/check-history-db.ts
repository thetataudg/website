// scripts/check-history-db.ts
// The derived finance stats against a real ledger.
//
//   npm run check:history
//
// The arithmetic here is the kind that looks obvious and isn't: a median over
// an even number of waits, an average that must stay null rather than zero when
// nothing has settled, and money on a voided charge that must not count as paid.
import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import DuesCharge from "@/lib/models/DuesCharge";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import FinanceEvent from "@/lib/models/FinanceEvent";
import CreditEntry from "@/lib/models/CreditEntry";
import PaymentPlan from "@/lib/models/PaymentPlan";
import { buildSchedule } from "@/lib/planMath";
import { normalizeDueDate } from "@/lib/dues";
import { financeHistoryFor } from "@/lib/financeHistory";
import { recordFinanceEvent } from "@/lib/financeEvents";
import { mintCredit } from "@/lib/credit";

const TAG = "ZZTEST-HISTORY";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
const day = (s: string) => normalizeDueDate(s) as Date;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const member: any = await Member.create({
    rollNo: `${TAG}-1`, fName: "Histy", lName: "McTestface",
    status: "Active", isECouncil: false, isCommitteeHead: false,
  });
  const term = "Fall 2026";

  try {
    console.log("\nan empty ledger says nothing rather than zero");
    let history = await financeHistoryFor(member, { term });
    check("no average — nothing has settled", history.stats.averageDaysToPayCharge, null);
    check("no median — nothing has been reviewed", history.stats.medianVerificationDays, null);
    check("nothing paid", history.stats.lifetimePaidCents, 0);
    check("empty timeline", history.timeline.length, 0);

    console.log("\na charge assigned, then settled");
    const charge: any = await DuesCharge.create({
      memberId: member._id, term, description: `${TAG} dues`, category: "dues",
      amountCents: 25000, dueDate: day("2026-09-01"), status: "open",
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
      // Punctuality hangs on paidOn, so the elapsed time must too.
      payments: [{ amountCents: 25000, method: "venmo", paidOn: day("2026-08-27"), recordedAt: new Date("2026-09-07T00:00:00.000Z") }],
    });
    history = await financeHistoryFor(member, { term });
    check("lifetime paid", history.stats.lifetimePaidCents, 25000);
    // Aug 15 to Aug 27 is 12 days — measured to when the money moved, not to
    // Sept 7 when an officer got round to it.
    check("days to pay measured on paidOn, not recordedAt", history.stats.averageDaysToPayCharge, 12);

    console.log("\na voided charge is not money the member paid");
    const voided: any = await DuesCharge.create({
      memberId: member._id, term, description: `${TAG} mistake`, category: "dues",
      amountCents: 9900, status: "void",
      payments: [{ amountCents: 9900, method: "cash", paidOn: day("2026-08-20") }],
    });
    history = await financeHistoryFor(member, { term });
    check("still just the real charge", history.stats.lifetimePaidCents, 25000);
    await DuesCharge.deleteOne({ _id: voided._id });

    console.log("\nthe median treasurer wait");
    // Four waits: 2, 4, 10, 30 days. The mean is 11.5 and flattered by nothing;
    // the median is 7, which is the number that describes the typical member.
    const waits = [
      ["2026-09-01", "2026-09-03"],
      ["2026-09-01", "2026-09-05"],
      ["2026-09-01", "2026-09-11"],
      ["2026-09-01", "2026-10-01"],
    ];
    for (const [filed, reviewed] of waits) {
      await PaymentSubmission.create({
        memberId: member._id, chargeId: charge._id, amountCents: 1000,
        method: "venmo", paidOn: day(filed), submittedAt: new Date(`${filed}T00:00:00.000Z`),
        reviewedAt: new Date(`${reviewed}T00:00:00.000Z`), status: "verified",
      });
    }
    history = await financeHistoryFor(member, { term });
    check("median of 2, 4, 10, 30", history.stats.medianVerificationDays, 7);
    check("not the mean, which one stale claim would inflate", history.stats.medianVerificationDays === 12, false);
    check("all four counted", history.stats.submissionsFiled, 4);

    console.log("\nrejections are counted, and a pending claim isn't a wait");
    await PaymentSubmission.create({
      memberId: member._id, chargeId: charge._id, amountCents: 1000, method: "cash",
      paidOn: day("2026-09-01"),
      submittedAt: new Date("2026-09-01T00:00:00.000Z"), status: "rejected",
      reviewedAt: new Date("2026-09-02T00:00:00.000Z"), reviewNote: "couldn't find it",
    });
    await PaymentSubmission.create({
      memberId: member._id, chargeId: charge._id, amountCents: 1000, method: "cash",
      paidOn: day("2026-09-01"),
      submittedAt: new Date("2026-09-01T00:00:00.000Z"), status: "pending",
    });
    history = await financeHistoryFor(member, { term });
    check("rejections counted", history.stats.submissionsRejected, 1);
    check("six filed in total", history.stats.submissionsFiled, 6);
    // Only verified claims have a completed wait; a rejection or a pending one
    // would drag the median toward a number that means nothing.
    check("median unchanged by a rejection or a pending claim", history.stats.medianVerificationDays, 7);

    console.log("\nreminders are counted within the term, not for all time");
    for (const when of ["2026-09-02", "2026-09-05", "2026-09-08"]) {
      await recordFinanceEvent({
        memberId: member._id, actorId: null, type: "reminder_sent",
        amountCents: 25000, summary: `${TAG} reminder`,
        occurredAt: new Date(`${when}T16:00:00.000Z`), channel: "inapp",
      });
    }
    await recordFinanceEvent({
      memberId: member._id, actorId: null, type: "reminder_sent",
      amountCents: 25000, summary: `${TAG} last spring`,
      occurredAt: new Date("2026-03-01T16:00:00.000Z"), channel: "inapp",
    });
    history = await financeHistoryFor(member, { term });
    check("three this term", history.stats.timesRemindedThisTerm, 3);
    check("the spring one is excluded", history.stats.timesRemindedThisTerm === 4, false);

    console.log("\nmissed installments and credit held");
    await recordFinanceEvent({
      memberId: member._id, actorId: null, type: "installment_missed",
      amountCents: 8333, summary: `${TAG} missed`, meta: { seq: 2 },
    });
    await mintCredit({ memberId: member._id, amountCents: 4000, note: TAG });
    history = await financeHistoryFor(member, { term });
    check("one missed", history.stats.installmentsMissed, 1);
    check("credit held", history.stats.creditHeldCents, 4000);

    console.log("\nplans counted by outcome, not just totalled");
    // The profile has to hold several plans per member now that plans are
    // scoped to charges — and "finished three" vs "defaulted two" are the same
    // count and completely different members.
    check("none yet", [history.stats.plansLive, history.stats.plansCompleted, history.stats.plansDefaulted], [0, 0, 0]);
    const sched = buildSchedule(20000, 2, new Date("2026-09-01T00:00:00.000Z"));
    await PaymentPlan.create([
      { memberId: member._id, term, chargeIds: [], totalCents: 20000, baselinePaidCents: 0, installments: sched, proposedAt: new Date(), status: "active" },
      { memberId: member._id, term, chargeIds: [], totalCents: 20000, baselinePaidCents: 0, installments: sched, proposedAt: new Date(), status: "pending" },
      { memberId: member._id, term, chargeIds: [], totalCents: 20000, baselinePaidCents: 0, installments: sched, proposedAt: new Date(), status: "completed" },
      { memberId: member._id, term, chargeIds: [], totalCents: 20000, baselinePaidCents: 0, installments: sched, proposedAt: new Date(), status: "defaulted" },
    ]);
    history = await financeHistoryFor(member, { term });
    check("active and pending both count as live", history.stats.plansLive, 2);
    check("finished counted separately", history.stats.plansCompleted, 1);
    check("and so is a default", history.stats.plansDefaulted, 1);
    // A denied or cancelled plan is neither live nor an achievement nor a
    // failure to pay — it should fall through all three buckets.
    await PaymentPlan.create({ memberId: member._id, term, chargeIds: [], totalCents: 20000, baselinePaidCents: 0, installments: sched, proposedAt: new Date(), status: "denied" });
    history = await financeHistoryFor(member, { term });
    check("a denied plan lands in none of them", [history.stats.plansLive, history.stats.plansCompleted, history.stats.plansDefaulted], [2, 1, 1]);

    console.log("\nthe timeline itself");
    history = await financeHistoryFor(member, { term });
    // Asserted as a property rather than a named row: the fixtures deliberately
    // span dates either side of today, and pinning row zero would make this
    // test fail on a calendar change rather than on a bug.
    const times = history.timeline.map((e) => Date.parse(e.occurredAt ?? "")).filter(Number.isFinite);
    check("newest first", times.every((t, i) => i === 0 || times[i - 1] >= t), true);
    check("and everything is there", history.timeline.length, 5);
    check("every entry names an actor slot", history.timeline.every((e) => "actor" in e), true);
    // Null actor is the cron. The UI turns this into "System"; conflating it
    // with a person would hide who decided what.
    check("the system's events carry no actor", history.timeline[0]?.actor, null);
    check("summaries come back verbatim", history.timeline.some((e) => e.summary === `${TAG} reminder`), true);
    check("the member is named", history.member.rollNo, member.rollNo);
  } finally {
    const counts = await Promise.all([
      DuesCharge.deleteMany({ term, description: { $regex: TAG } }),
      PaymentSubmission.deleteMany({ memberId: member._id }),
      FinanceEvent.deleteMany({ memberId: member._id }),
      CreditEntry.deleteMany({ memberId: member._id }),
      PaymentPlan.deleteMany({ memberId: member._id }),
      Member.deleteOne({ _id: member._id }),
    ]);
    console.log(`\ncleaned up: ${counts.map((c: any) => c.deletedCount).join(", ")} docs`);
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
