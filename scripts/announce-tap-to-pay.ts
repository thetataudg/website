// scripts/announce-tap-to-pay.ts
// The one-time Tap to Pay on iPhone awareness push.
//
//   npm run announce:taptopay -- --dry
//   npm run announce:taptopay -- --send
//
// Apple requires that every eligible user be told at least once that Tap to
// Pay on iPhone exists, and names a push notification as an accepted way of
// doing it (requirement 3.3, and Marketing 6.3). The in-app splash covers the
// same requirement for anyone who opens the app; this covers the officer who
// has not opened it since the feature shipped.
//
// Deliberately a script rather than a route or a cron. It is sent once, at
// launch, by a person who has decided to send it — there is no schedule to put
// it on and nothing should be able to fire it twice by accident.
//
// The copy is not written here. It comes from `renderTemplate`, which carries
// Apple's approved Value proposition wording verbatim from the Tap to Pay on
// iPhone Marketing Guide; nothing in this file may reword it.
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { terminalOperatorRecipients, displayName } from "@/lib/notify/audience";
import { notifyMany } from "@/lib/notify";
import { renderTemplate } from "@/lib/notify/templates";
import Notification from "@/lib/models/Notification";

const TEMPLATE = "tap_to_pay_available" as const;

async function main() {
  const send = process.argv.includes("--send");
  const dry = !send;

  await connectDB();

  const recipients = await terminalOperatorRecipients();
  if (recipients.length === 0) {
    console.log("No eligible officers found. Nothing to send.");
    return;
  }

  // Idempotent by inspection rather than by a flag column: the awareness push
  // is a one-off, and the honest way to avoid sending it twice is to look for
  // the row the first send would have written.
  const already = await Notification.find({
    template: TEMPLATE,
    memberId: { $in: recipients.map((r) => r.memberId) },
  })
    .select("memberId")
    .lean<any[]>();
  const alreadyIds = new Set(already.map((row) => String(row.memberId)));

  const pending = recipients.filter((r) => !alreadyIds.has(String(r.memberId)));

  const message = renderTemplate(TEMPLATE, {
    firstName: "",
    amountCents: 0,
  } as any);

  console.log(`Eligible officers: ${recipients.length}`);
  console.log(`Already told:      ${alreadyIds.size}`);
  console.log(`Would send to:     ${pending.length}`);
  console.log("");
  for (const recipient of pending) {
    console.log(`  · ${displayName(recipient)} <${recipient.email ?? "no email"}>`);
  }
  console.log("");
  console.log(`  title: ${message.title}`);
  console.log(`  push:  ${message.push}`);
  console.log("");

  if (dry) {
    console.log("Dry run. Re-run with --send to actually send.");
    return;
  }
  if (pending.length === 0) {
    console.log("Everyone eligible has already been told. Nothing sent.");
    return;
  }

  const report = await notifyMany(
    pending.map((recipient) => ({
      recipient,
      template: TEMPLATE,
      context: { firstName: recipient.firstName, amountCents: 0 } as any,
    }))
  );
  console.log(report.summary);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => undefined);
  });
