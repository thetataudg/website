/**
 * Gives existing dues charges a history, so member timelines don't start blank
 * on the day the treasury feature ships.
 *
 *   node scripts/backfill-finance-events.mjs --dry     # report only
 *   node scripts/backfill-finance-events.mjs           # write
 *   node scripts/backfill-finance-events.mjs --undo    # remove what it wrote
 *
 * Every document it creates carries `meta.backfill: true`, which is what --undo
 * matches on — events written by the live app are never touched. Re-running is
 * safe: a charge that already has a backfilled event is skipped.
 */
import "dotenv/config";
import mongoose from "mongoose";

const PHOENIX = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Phoenix",
};

function formatCents(cents) {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body =
    rem === 0
      ? `$${dollars.toLocaleString("en-US")}`
      : `$${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
  return cents < 0 ? `-${body}` : body;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const undo = process.argv.includes("--undo");

  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const charges = mongoose.connection.db.collection("duescharges");
  const events = mongoose.connection.db.collection("financeevents");

  if (undo) {
    const { deletedCount } = await events.deleteMany({ "meta.backfill": true });
    console.log(`Removed ${deletedCount} backfilled event(s).`);
    await mongoose.disconnect();
    return;
  }

  const alreadyDone = new Set(
    (
      await events
        .find({ "meta.backfill": true }, { projection: { "refs.chargeId": 1 } })
        .toArray()
    )
      .map((event) => event.refs?.chargeId?.toString())
      .filter(Boolean)
  );

  const all = await charges.find({}).toArray();
  const pending = all.filter((charge) => !alreadyDone.has(charge._id.toString()));

  const docs = [];
  for (const charge of pending) {
    const description = charge.description || "Chapter dues";
    const due = charge.dueDate ? new Date(charge.dueDate) : null;

    docs.push({
      memberId: charge.memberId,
      actorId: charge.createdBy ?? null,
      type: "charge_assigned",
      // The charge's own creation time, not now — the point of a backfill is
      // to place these where they actually belong on the timeline.
      occurredAt: charge.createdAt ? new Date(charge.createdAt) : new Date(),
      amountCents: Number(charge.amountCents) || 0,
      summary: due
        ? `Assigned ${formatCents(Number(charge.amountCents) || 0)} — ${description}, due ${due.toLocaleDateString("en-US", PHOENIX)}`
        : `Assigned ${formatCents(Number(charge.amountCents) || 0)} — ${description}`,
      channel: "",
      refs: {
        chargeId: charge._id,
        planId: null,
        reimbursementId: null,
        submissionId: null,
        creditEntryId: null,
        paymentId: null,
      },
      meta: { backfill: true, term: charge.term, category: charge.category },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    for (const payment of charge.payments || []) {
      const cents = Number(payment.amountCents) || 0;
      // Pre-split rows only have `recordedAt`. It's the best evidence of when
      // the money moved that these records will ever have, so it seeds
      // `paidOn` — but the summary says "recorded" rather than "paid" to keep
      // the distinction honest for anything backfilled.
      const when = payment.paidOn
        ? new Date(payment.paidOn)
        : payment.recordedAt
        ? new Date(payment.recordedAt)
        : new Date();
      docs.push({
        memberId: charge.memberId,
        actorId: payment.recordedBy ?? null,
        type: "payment_recorded",
        occurredAt: when,
        amountCents: cents,
        summary: `Recorded ${formatCents(cents)} by ${payment.method || "other"}`,
        channel: "",
        refs: {
          chargeId: charge._id,
          planId: null,
          reimbursementId: null,
          submissionId: null,
          creditEntryId: null,
          paymentId: payment._id ?? null,
        },
        meta: { backfill: true, method: payment.method || "other" },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  console.log(
    `${all.length} charge(s) total, ${pending.length} without history, ` +
      `${docs.length} event(s) to write.`
  );

  if (dry) {
    for (const doc of docs.slice(0, 10)) {
      console.log(`  ${doc.occurredAt.toISOString().slice(0, 10)}  ${doc.type.padEnd(18)}  ${doc.summary}`);
    }
    if (docs.length > 10) console.log(`  … and ${docs.length - 10} more`);
    console.log("Dry run — nothing written.");
  } else if (docs.length) {
    await events.insertMany(docs, { ordered: false });
    console.log(`Wrote ${docs.length} event(s).`);
  } else {
    console.log("Nothing to do.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
