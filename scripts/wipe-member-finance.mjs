/**
 * Clears one member's entire financial history from the development database.
 *
 *   node -r dotenv/config scripts/wipe-member-finance.mjs --roll=426 --dry
 *   node -r dotenv/config scripts/wipe-member-finance.mjs --roll=426 --yes
 *
 * A demo tool, not a product feature. FinanceEvent is append-only by design and
 * nothing in the app deletes one — that's the whole point of keeping them — so
 * this deliberately lives outside the app and refuses to run without --yes.
 *
 * What it will not touch:
 *   - the Member document itself
 *   - DeviceToken rows, because push has to keep working after the wipe and a
 *     token is a fact about a phone, not part of anyone's ledger
 *
 * It refuses outright unless the connection string names a database containing
 * "dev". Losing a real chapter's ledger to a mistyped roll number is not a
 * recoverable mistake.
 */
import mongoose from "mongoose";

const COLLECTIONS = [
  "duescharges",
  "paymentsubmissions",
  "paymentplans",
  "reimbursements",
  "creditentries",
  "financeevents",
  "notifications",
];

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

async function main() {
  const roll = arg("roll");
  const dry = process.argv.includes("--dry");
  const confirmed = process.argv.includes("--yes");

  if (!roll) {
    console.error("Usage: --roll=<rollNo> [--dry|--yes]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;

  if (!/dev/i.test(db.databaseName)) {
    console.error(
      `Refusing to run: database is "${db.databaseName}", which is not a development database.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const member = await db.collection("members").findOne({ rollNo: roll });
  if (!member) {
    console.error(`No member with rollNo ${roll}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(
    `Database ${db.databaseName} — roll ${roll}, ${member.fName} ${member.lName} (${member._id})\n`
  );

  const filter = { memberId: member._id };
  let total = 0;
  const counts = {};
  for (const name of COLLECTIONS) {
    counts[name] = await db.collection(name).countDocuments(filter);
    total += counts[name];
    console.log(`  ${name.padEnd(20)} ${counts[name]}`);
  }
  // Reported rather than counted, so it's obvious the wipe left push working.
  const tokens = await db.collection("devicetokens").countDocuments(filter);
  console.log(`  ${"devicetokens".padEnd(20)} ${tokens}  (kept)\n`);

  if (total === 0) {
    console.log("Nothing to delete — already clean.");
    await mongoose.disconnect();
    return;
  }

  if (dry || !confirmed) {
    console.log(
      dry
        ? `Dry run: would delete ${total} document(s). Re-run with --yes to do it.`
        : `Refusing without --yes. ${total} document(s) would be deleted.`
    );
    await mongoose.disconnect();
    process.exit(dry ? 0 : 1);
  }

  let deleted = 0;
  for (const name of COLLECTIONS) {
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    deleted += deletedCount;
    console.log(`  deleted ${String(deletedCount).padStart(3)} from ${name}`);
  }
  console.log(`\nDone. ${deleted} document(s) removed. Member and device token kept.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
