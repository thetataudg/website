// scripts/check-notify-db.ts
// The reminder pipeline against a real database: the cooldown gate, the four
// exclusions the selector has to honour, and what the nightly pass does to
// plans and to the credit invariant.
//
//   npm run check:notify
//
// Every query is scoped to one throwaway member and a tagged term, and
// everything created is deleted in a finally. Nothing here can reach a real
// member's ledger — which matters, because a bug in this file would otherwise
// send notifications to the actual chapter.
import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import DuesCharge, { balanceCentsFor } from "@/lib/models/DuesCharge";
import PaymentPlan from "@/lib/models/PaymentPlan";
import PaymentSubmission from "@/lib/models/PaymentSubmission";
import CreditEntry from "@/lib/models/CreditEntry";
import FinanceEvent from "@/lib/models/FinanceEvent";
import Notification from "@/lib/models/Notification";
import { normalizeDueDate } from "@/lib/dues";
import { buildSchedule } from "@/lib/planMath";
import { mintCredit, creditBalanceCents } from "@/lib/credit";
import {
  selectReminderCandidates,
  templateForCharge,
  calendarDaysUntil,
  phoenixDayLabel,
} from "@/lib/notify/selector";
import { notify, notifyMany, isInCooldown, membersInCooldown } from "@/lib/notify";
import { renderTemplate } from "@/lib/notify/templates";
import { advancePlans, reconcileCredit } from "@/lib/duesCron";

const TAG = "ZZTEST-NOTIFY";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
const day = (s: string) => normalizeDueDate(s) as Date;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  // A member of our own, so nothing in here can touch the real chapter.
  const member: any = await Member.create({
    rollNo: `${TAG}-1`,
    fName: "Testy",
    lName: "McTestface",
    status: "Active",
    isECouncil: false,
    isCommitteeHead: false,
  });
  const scope = [member._id];
  console.log(`\ntesting against throwaway member ${member.rollNo}\n`);

  const recipient = {
    memberId: member._id,
    firstName: "Testy",
    lastName: "McTestface",
    rollNo: member.rollNo,
    email: null,
  };
  const charge = async () =>
    DuesCharge.findOne({ memberId: member._id, term: TAG }).lean<any>();

  try {
    console.log("calendar arithmetic — 'due in 7 days' means seven sleeps");
    const sept1 = day("2026-09-01");
    check("the day itself", calendarDaysUntil(sept1, new Date("2026-09-01T18:00:00.000Z")), 0);
    // 5pm Phoenix on Aug 31 is already Sept 1 in UTC; the answer must still be 1.
    check("5pm Phoenix the day before is still one day out", calendarDaysUntil(sept1, new Date("2026-09-01T00:00:00.000Z")), 1);
    check("a week out", calendarDaysUntil(sept1, new Date("2026-08-25T18:00:00.000Z")), 7);
    check("three days late", calendarDaysUntil(sept1, new Date("2026-09-04T18:00:00.000Z")), -3);

    console.log("\nwhich reminder today calls for");
    check("T-7", templateForCharge(sept1, new Date("2026-08-25T18:00:00.000Z"))?.template, "upcoming");
    check("T-1", templateForCharge(sept1, new Date("2026-08-31T18:00:00.000Z"))?.template, "due_soon");
    check("the day", templateForCharge(sept1, new Date("2026-09-01T18:00:00.000Z"))?.template, "due_today");
    check("T-6 is silence", templateForCharge(sept1, new Date("2026-08-26T18:00:00.000Z")), null);
    check("one day late is silence", templateForCharge(sept1, new Date("2026-09-02T18:00:00.000Z")), null);
    check("three days late chases", templateForCharge(sept1, new Date("2026-09-04T18:00:00.000Z"))?.template, "overdue");
    check("and says how late", templateForCharge(sept1, new Date("2026-09-04T18:00:00.000Z"))?.daysOverdue, 3);
    check("four days late is silence again", templateForCharge(sept1, new Date("2026-09-05T18:00:00.000Z")), null);
    check("six days late chases again", templateForCharge(sept1, new Date("2026-09-07T18:00:00.000Z"))?.template, "overdue");

    console.log("\npush bodies stay under the truncation limit");
    for (const template of ["assigned", "upcoming", "due_soon", "due_today", "overdue", "installment_due"] as const) {
      const rendered = renderTemplate(template, {
        firstName: "Testy", amountCents: 1234567, dueLabel: "Sept 1",
        daysOverdue: 12, installmentSeq: 3, installmentCount: 8,
        description: "Chapter dues",
      });
      check(`${template} push fits`, rendered.push.length < 120, true);
      check(`${template} has a subject`, rendered.emailSubject.length > 0, true);
    }

    console.log("\nthe selector: somebody who simply hasn't paid");
    const created = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} dues`,
      category: "dues", amountCents: 25000, dueDate: day("2026-09-01"), status: "open",
    });
    const onTheDay = new Date("2026-09-01T18:00:00.000Z");
    let selection = await selectReminderCandidates({ now: onTheDay, memberIds: scope });
    check("is a candidate", selection.candidates.length, 1);
    check("with the right template", selection.candidates[0]?.template, "due_today");
    check("and the whole balance", selection.candidates[0]?.amountCents, 25000);
    check("the label is a Phoenix calendar day", phoenixDayLabel(day("2026-09-01")), "Sep 1");

    console.log("\nthe four exclusions — every one is a member who did the right thing");
    const submission = await PaymentSubmission.create({
      memberId: member._id, chargeId: created._id, amountCents: 25000,
      method: "venmo", paidOn: day("2026-08-31"), submittedAt: new Date(), status: "pending",
    });
    selection = await selectReminderCandidates({ now: onTheDay, memberIds: scope });
    check("a payment claim in the queue stops the chasing", selection.candidates.length, 0);
    check("and says why", selection.skipped[0]?.reason, "payment claim in the queue");
    await PaymentSubmission.deleteOne({ _id: submission._id });

    const plan: any = await PaymentPlan.create({
      memberId: member._id, term: TAG, chargeIds: [created._id], totalCents: 25000,
      baselinePaidCents: 0, installments: buildSchedule(25000, 3, day("2026-09-01")),
      proposedAt: new Date("2026-08-30T12:00:00.000Z"), status: "pending",
    });
    selection = await selectReminderCandidates({ now: onTheDay, memberIds: scope });
    check("a plan request in the queue stops it too", selection.candidates.length, 0);
    check("and says why", selection.skipped[0]?.reason, "plan request in the queue");

    await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "denied", graceUntil: new Date("2026-09-06T06:59:59.999Z") } });
    selection = await selectReminderCandidates({ now: onTheDay, memberIds: scope });
    check("a denied plan buys five quiet days", selection.candidates.length, 0);
    check("and says why", selection.skipped[0]?.reason, "inside the grace window after a denied plan");
    selection = await selectReminderCandidates({ now: new Date("2026-09-10T18:00:00.000Z"), memberIds: scope });
    check("but only five", selection.candidates.length, 1);

    await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "active", graceUntil: null } });
    // Three days past the installment: a chase day on the every-third-day cadence.
    selection = await selectReminderCandidates({ now: new Date("2026-09-04T18:00:00.000Z"), memberIds: scope });
    check("a live plan replaces the dues reminders", selection.candidates[0]?.template, "installment_due");
    check("asking only for the installment", selection.candidates[0]?.amountCents, 8334);
    check("never the whole balance", selection.candidates[0]?.amountCents === 25000, false);

    // The same member two days later is silent — but the reason must not claim
    // they're fine, because they are two weeks behind.
    selection = await selectReminderCandidates({ now: new Date("2026-09-15T18:00:00.000Z"), memberIds: scope });
    check("off-cadence days are quiet", selection.candidates.length, 0);
    check("without pretending they're up to date", selection.skipped[0]?.reason, "14 days behind on the plan, chased within the last 3");

    // Before the installment's own day, silence is correct.
    selection = await selectReminderCandidates({ now: new Date("2026-08-20T18:00:00.000Z"), memberIds: scope });
    check("a plan in good standing is left alone", selection.candidates.length, 0);
    check("and says why", selection.skipped[0]?.reason, "plan in good standing");

    console.log("\na zero balance is nothing to chase — however it got there");
    await mintCredit({ memberId: member._id, amountCents: 25000, note: TAG });
    const repaired = await reconcileCredit(null, scope);
    check("the nightly pass repaired the invariant", repaired.reconciled, 1);
    check("draining the credit into the charge", repaired.appliedCents, 25000);
    check("balance is clear", balanceCentsFor(await charge()), 0);
    check("credit is spent", await creditBalanceCents(member._id), 0);
    selection = await selectReminderCandidates({ now: onTheDay, memberIds: scope });
    check("nobody is chased for a balance credit settled", selection.candidates.length, 0);
    check("and it isn't even listed as a skip — there is nothing to say", selection.skipped.length, 0);

    console.log("\nthe plan finishes itself");
    let advanced = await advancePlans(new Date("2026-12-01T18:00:00.000Z"), scope);
    check("completed", advanced.completed, 1);
    check("not defaulted", advanced.defaulted, 0);
    check("status written", (await PaymentPlan.findById(plan._id).lean<any>())?.status, "completed");
    check("with a line in the history", await FinanceEvent.countDocuments({ "refs.planId": plan._id, type: "plan_completed" }), 1);

    console.log("\ntwo misses flag a conversation, and only announce each once");
    await DuesCharge.updateOne({ _id: created._id }, { $set: { payments: [] } });
    await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "active" } });
    const late = new Date("2026-10-15T18:00:00.000Z");
    advanced = await advancePlans(late, scope);
    check("both misses logged", advanced.installmentsMarkedLate, 2);
    check("plan flagged", advanced.defaulted, 1);
    await PaymentPlan.updateOne({ _id: plan._id }, { $set: { status: "active" } });
    advanced = await advancePlans(late, scope);
    check("running it again re-announces nothing", advanced.installmentsMarkedLate, 0);
    check("one event per missed installment, ever", await FinanceEvent.countDocuments({ "refs.planId": plan._id, type: "installment_missed" }), 2);
    check("a default is a flag, not a penalty — the balance never accelerated", balanceCentsFor(await charge()), 25000);

    console.log("\nthe cooldown gate");
    await PaymentPlan.deleteMany({ term: TAG });
    const context = { firstName: "Testy", amountCents: 25000, dueLabel: "Sep 1" };
    const first = await notify({ recipient, template: "due_today", context, refs: {} });
    check("the first one goes", first.sent, true);
    check("in-app is always a channel", first.channels, ["inapp"]);
    check(
      "every delivery attempt is reported",
      first.attempts.map(({ channel, delivered }) => ({ channel, delivered })),
      [
        { channel: "inapp", delivered: true },
        { channel: "email", delivered: false },
        { channel: "push", delivered: false },
      ]
    );
    const storedFirst = await Notification.findOne({
      memberId: member._id,
      template: "due_today",
    }).lean<any>();
    check(
      "failed external attempts are retained for diagnosis",
      storedFirst?.deliveryAttempts?.map((attempt: any) => ({
        channel: attempt.channel,
        delivered: attempt.delivered,
      })),
      [
        { channel: "inapp", delivered: true },
        { channel: "email", delivered: false },
        { channel: "push", delivered: false },
      ]
    );
    check("and it's now in cooldown", await isInCooldown(member._id, "due_today"), true);
    const second = await notify({ recipient, template: "due_today", context, refs: {} });
    check("the second is refused", second.sent, false);
    check("for the right reason", second.skipped, "cooldown");
    check("only one row was written", await Notification.countDocuments({ memberId: member._id, template: "due_today" }), 1);
    check("a different template is unaffected", await isInCooldown(member._id, "overdue"), false);
    check("the batch check agrees", (await membersInCooldown(scope, "due_today")).has(String(member._id)), true);

    console.log("\ntransactional notices bypass it — they answer something the member did");
    check("not gated to begin with", await isInCooldown(member._id, "payment_verified"), false);
    const verified = await notify({ recipient, template: "payment_verified", context, refs: {} });
    check("first goes", verified.sent, true);
    const verifiedAgain = await notify({ recipient, template: "payment_verified", context, refs: {} });
    check("and so does the second", verifiedAgain.sent, true);
    check("two rows", await Notification.countDocuments({ memberId: member._id, template: "payment_verified" }), 2);

    console.log("\nwhat the treasurer is told");
    const report = await notifyMany([
      { recipient, template: "due_today", context, refs: {} },
      { recipient, template: "overdue", context, refs: {} },
    ]);
    check("one sent, one already reminded today", [report.sentCount, report.skippedCount], [1, 1]);
    check("said plainly", report.summary, "Sent to 1. Skipped 1 already reminded today.");

    console.log("\nevery send leaves an audit line, delivered or not");
    // Counted against each other rather than against a fixed number. This
    // section used to expect exactly the four it sent by hand, but the ledger
    // fan-out means the plan advancement earlier in this run now tells the
    // member about their own missed installments too. The invariant worth
    // guarding was never the total — it's that a notification and its audit
    // line are written together or not at all.
    const events = await FinanceEvent.find({ memberId: member._id, type: "reminder_sent" }).lean<any[]>();
    const stored = await Notification.countDocuments({ memberId: member._id });
    check("one audit line per notification", events.length, stored);
    check("naming the channel", events[0]?.channel, "inapp");
    check("and the template", events[0]?.meta?.template !== undefined, true);
    check("the four this section sent are in there", stored >= 4, true);
    const unread = await Notification.countDocuments({ memberId: member._id, readAt: null });
    check("all unread to start", unread, stored);
  } finally {
    const charges = await DuesCharge.find({ term: TAG }).select("_id").lean<any[]>();
    const counts = await Promise.all([
      DuesCharge.deleteMany({ term: TAG }),
      PaymentPlan.deleteMany({ term: TAG }),
      PaymentSubmission.deleteMany({ chargeId: { $in: charges.map((c) => c._id) } }),
      CreditEntry.deleteMany({ memberId: member._id }),
      FinanceEvent.deleteMany({ memberId: member._id }),
      Notification.deleteMany({ memberId: member._id }),
      Member.deleteOne({ _id: member._id }),
    ]);
    console.log(`\ncleaned up: ${counts.map((c: any) => c.deletedCount).join(", ")} docs`);
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
