// scripts/check-online-payments-db.ts
// End-to-end checks for Stripe dues payments, against the development database
// and Stripe's own test mode.
//
//   npm run check:payments
//
// This drives a real PaymentIntent through a real card and a real refund,
// because the questions worth asking here are not arithmetic. The one that
// matters most: between the member paying and the ledger being posted, does
// their balance stay untouched while the payment shows as pending? Everything
// this feature promises about not losing money rests on that being true.
//
// Run with RESEND_API_KEY and the APNs keys blanked so no member is emailed or
// pushed by a test. Everything it writes is tagged and deleted in a finally.
import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import DuesCharge, {
  balanceCentsFor,
  memberPaidCentsFor,
} from "@/lib/models/DuesCharge";
import OnlineDuesPayment from "@/lib/models/OnlineDuesPayment";
import CreditEntry from "@/lib/models/CreditEntry";
import FinanceEvent from "@/lib/models/FinanceEvent";
import Notification from "@/lib/models/Notification";
import {
  fulfillOnlineDuesPayment,
  initialAllocations,
  isOnlinePaymentPending,
  reconcileOnlineDuesReversal,
  serializeOnlinePayment,
} from "@/lib/onlineDuesPayments";
import { getStripe } from "@/lib/stripe";

const TAG = "ZZTEST-PAY";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
const reload = (id: any) => DuesCharge.findById(id).lean<any>();
const reloadPayment = (id: any) => OnlineDuesPayment.findById(id).lean<any>();

async function main() {
  if (!/^sk_test_/.test(process.env.STRIPE_SECRET_KEY || "")) {
    throw new Error("refusing to run: STRIPE_SECRET_KEY is not a test key");
  }
  await mongoose.connect(process.env.MONGODB_URI as string);
  const member = await Member.findOne({ status: "Active" })
    .select("_id rollNo")
    .lean<any>();
  if (!member) throw new Error("no active member to test against");
  console.log(`\ntesting against member ${member.rollNo}, tag ${TAG}\n`);
  const stripe = getStripe();
  // Every OnlineDuesPayment this run creates, so the finally can take them all
  // back regardless of which check threw.
  const created: any[] = [];

  try {
    const charge = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} dues`,
      category: "dues", amountCents: 25000,
      dueDate: new Date("2026-09-01T00:00:00.000Z"), status: "open",
    });

    console.log("starting a payment");
    const openCharges = [await reload(charge._id)];
    const row = await OnlineDuesPayment.create({
      memberId: member._id, requestedKind: "full",
      principalCents: 25000, feeCents: 0, totalCents: 25000, currency: "usd",
      note: `${TAG} paying in full`,
      allocations: initialAllocations(openCharges, 25000),
      status: "creating",
    });
    created.push(row._id);
    check("the whole balance is allocated up front", row.allocations.map((a: any) => a.amountCents), [25000]);
    check("nothing is pending before the member authorizes it", isOnlinePaymentPending(await reloadPayment(row._id)), false);

    const intent = await stripe.paymentIntents.create({
      amount: 25000, currency: "usd",
      payment_method_types: ["card"],
      description: `${TAG} dues`,
      metadata: { onlineDuesPaymentId: String(row._id), tag: TAG },
    }, { idempotencyKey: `dues-payment-${row._id}` });
    await OnlineDuesPayment.findByIdAndUpdate(row._id, {
      stripePaymentIntentId: intent.id, status: intent.status,
    });
    check("Stripe is waiting on a payment method", intent.status, "requires_payment_method");
    check("and that is still not pending", isOnlinePaymentPending(await reloadPayment(row._id)), false);

    console.log("\nthe member pays");
    const confirmed = await stripe.paymentIntents.confirm(intent.id, {
      payment_method: "pm_card_visa",
      return_url: "https://ttdg.org/member/dues",
    });
    check("the card went through", confirmed.status, "succeeded");
    // The sync route stamps this the moment the sheet closes.
    await OnlineDuesPayment.findByIdAndUpdate(row._id, { confirmedAt: new Date() });

    console.log("\npaid, but not yet posted — the window this feature lives or dies in");
    const midflight = await reloadPayment(row._id);
    check("the payment reads as pending", isOnlinePaymentPending(midflight), true);
    check("and says so to the client", serializeOnlinePayment(midflight).pending, true);
    // The whole point: Stripe has the money, the chapter has not confirmed it,
    // and nothing has been deducted from anybody on the strength of that.
    check("the balance has NOT moved", balanceCentsFor(await reload(charge._id)), 25000);
    check("no payment row exists yet", (await reload(charge._id)).payments.length, 0);
    check("so nothing blocks a void yet", memberPaidCentsFor(await reload(charge._id)), 0);

    console.log("\nthe webhook posts it");
    const expanded = await stripe.paymentIntents.retrieve(intent.id, {
      expand: ["payment_method", "latest_charge"],
    });
    await fulfillOnlineDuesPayment(expanded);
    let after = await reload(charge._id);
    check("the balance is settled", balanceCentsFor(after), 0);
    check("one payment row", after.payments.length, 1);
    check("recorded as a card payment", after.payments[0].method, "card");
    check("the member's note rides along on the ledger row", after.payments[0].reference.includes(`${TAG} paying in full`), true);
    let paidRow = await reloadPayment(row._id);
    check("no longer pending", isOnlinePaymentPending(paidRow), false);
    check("posted at is stamped", Boolean(paidRow.ledgerPostedAt), true);
    check("and now the charge can't be taken back", memberPaidCentsFor(after) > 0, true);
    const events = await FinanceEvent.find({ "refs.paymentId": row._id }).lean<any[]>();
    check("one finance event", events.length, 1);
    check("it is the online-payment type", events[0].type, "payment_online_succeeded");
    check("the note is in the audit trail", events[0].meta?.note, `${TAG} paying in full`);

    console.log("\nthe webhook is delivered twice, as Stripe does");
    await fulfillOnlineDuesPayment(expanded);
    after = await reload(charge._id);
    check("still exactly one payment row", after.payments.length, 1);
    check("the member was not credited twice", balanceCentsFor(after), 0);
    check("and only one finance event", (await FinanceEvent.find({ "refs.paymentId": row._id }).lean<any[]>()).length, 1);

    console.log("\na refund reopens the balance");
    const chargeId = typeof expanded.latest_charge === "string"
      ? expanded.latest_charge
      : expanded.latest_charge?.id;
    await stripe.refunds.create({ charge: chargeId as string, amount: 10000 });
    await reconcileOnlineDuesReversal({
      paymentIntentId: intent.id, refundedCents: 10000, disputed: false,
    });
    after = await reload(charge._id);
    check("the refunded part is owed again", balanceCentsFor(after), 10000);
    check("the original payment row survives", after.payments.length, 1);
    check("marked reversed rather than deleted", after.payments[0].reversedCents, 10000);
    check("status says partially refunded", (await reloadPayment(row._id)).status, "partially_refunded");
    check("the rest still counts as paid", memberPaidCentsFor(after), 15000);

    console.log("\nrefunded in full");
    await stripe.refunds.create({ charge: chargeId as string, amount: 15000 });
    await reconcileOnlineDuesReversal({
      paymentIntentId: intent.id, refundedCents: 25000, disputed: false,
    });
    after = await reload(charge._id);
    check("the whole balance is back", balanceCentsFor(after), 25000);
    check("status says refunded", (await reloadPayment(row._id)).status, "refunded");
    // And with the money returned, the charge is a correction again.
    check("the charge can be taken back once more", memberPaidCentsFor(after), 0);

    console.log("\na declined card never touches the ledger");
    const declinedCharge = await DuesCharge.create({
      memberId: member._id, term: TAG, description: `${TAG} decline`,
      category: "dues", amountCents: 5000, status: "open",
    });
    const badRow = await OnlineDuesPayment.create({
      memberId: member._id, requestedKind: "full",
      principalCents: 5000, feeCents: 0, totalCents: 5000, currency: "usd",
      allocations: initialAllocations([await reload(declinedCharge._id)], 5000),
      status: "creating",
    });
    created.push(badRow._id);
    const badIntent = await stripe.paymentIntents.create({
      amount: 5000, currency: "usd", payment_method_types: ["card"],
      metadata: { onlineDuesPaymentId: String(badRow._id), tag: TAG },
    });
    await OnlineDuesPayment.findByIdAndUpdate(badRow._id, {
      stripePaymentIntentId: badIntent.id, confirmedAt: new Date(),
    });
    let declined = false;
    try {
      await stripe.paymentIntents.confirm(badIntent.id, {
        payment_method: "pm_card_visa_chargeDeclined",
        return_url: "https://ttdg.org/member/dues",
      });
    } catch {
      declined = true;
    }
    check("Stripe rejected the card", declined, true);
    await OnlineDuesPayment.findByIdAndUpdate(badRow._id, {
      status: "failed", failureMessage: "Your card was declined.",
    });
    check("a failed payment is not pending", isOnlinePaymentPending(await reloadPayment(badRow._id)), false);
    check("and the balance is untouched", balanceCentsFor(await reload(declinedCharge._id)), 5000);
    check("so the charge is still removable", memberPaidCentsFor(await reload(declinedCharge._id)), 0);
  } finally {
    const charges = await DuesCharge.find({ term: TAG }).select("_id").lean<any[]>();
    const ids = created;
    const r = await Promise.all([
      DuesCharge.deleteMany({ term: TAG }),
      OnlineDuesPayment.deleteMany({ _id: { $in: ids } }),
      CreditEntry.deleteMany({ "refs.onlinePaymentId": { $in: ids } }),
      FinanceEvent.deleteMany({
        $or: [
          { "refs.chargeId": { $in: charges.map((c) => c._id) } },
          { "refs.paymentId": { $in: ids } },
        ],
      }),
      Notification.deleteMany({ "refs.paymentId": { $in: ids } }),
    ]);
    console.log(`\ncleaned up: ${r.map((x: any) => x.deletedCount).join(", ")} docs`);
    await mongoose.disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
