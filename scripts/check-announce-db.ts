// scripts/check-announce-db.ts
// The ledger fan-out against a real database: who hears about a movement, who
// deliberately doesn't, and what it writes to whose financial history.
//
//   npm run check:announce
//
// External channels are switched off in-process before anything runs — this
// creates real Notification rows for the real officers, and emailing or pushing
// the actual chapter to prove a routing rule would be an unforgivable way to
// test it. Every row created is deleted in a finally, matched on a timestamp
// taken before the first send.
delete process.env.RESEND_API_KEY;
delete process.env.APNS_KEY_P8;

import mongoose from "mongoose";
import Member from "@/lib/models/Member";
import Notification from "@/lib/models/Notification";
import FinanceEvent from "@/lib/models/FinanceEvent";
import { announce, announceBulk } from "@/lib/notify/announce";
import {
  invalidateOfficerCache,
  officerRecipients,
  treasuryRecipients,
} from "@/lib/notify/audience";
import { renderOfficerMessage } from "@/lib/notify/templates";

const TAG = "ZZTEST-ANN";
let pass = 0, fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}` +
      (ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  );
  ok ? pass++ : fail++;
}

async function rowsFor(memberId: any, since: Date) {
  return Notification.find({ memberId, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .lean<any[]>();
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { bufferCommands: false });
  const dbName = mongoose.connection.db?.databaseName ?? "";
  if (!/dev/i.test(dbName)) {
    throw new Error(`Refusing to run against ${dbName}`);
  }

  const started = new Date();
  let plainMember: any, officerMember: any;

  try {
    // A rank-and-file member, and a member who also sits on E-Council. The
    // second one is the interesting case: they are both the person the money
    // belongs to and one of the people who hear about everything.
    plainMember = await Member.create({
      rollNo: `${TAG}-1`, fName: "Testy", lName: "Member",
      isECouncil: false, role: "member", status: "Active",
      needsProfileReview: false, needsPermissionReview: false,
    });
    officerMember = await Member.create({
      rollNo: `${TAG}-2`, fName: "Testy", lName: "Officer",
      isECouncil: true, ecouncilPosition: "Treasurer", role: "member", status: "Active",
      needsProfileReview: false, needsPermissionReview: false,
    });
    invalidateOfficerCache();

    const officers = await officerRecipients();
    const officerIds = officers.map((o) => String(o.memberId));
    console.log(`\n${officers.length} officer(s) in the audience\n`);
    check("the test officer is in the audience", officerIds.includes(String(officerMember._id)), true);
    check("a plain member is not", officerIds.includes(String(plainMember._id)), false);

    const treasury = await treasuryRecipients();
    check("finance has one internal recipient", treasury.length, 1);
    check("that recipient is the Treasurer", String(treasury[0]?.memberId), String(officerMember._id));
    check("treasury email uses the shared mailbox", treasury[0]?.email, "treasurer@thetatau-dg.org");

    // --- 1. a member acts: officers hear, the member does not ---
    console.log("\nA member files a payment claim");
    let mark = new Date();
    await announce({
      event: "payment_submitted",
      memberId: plainMember._id,
      actorId: plainMember._id,
      amountCents: 4500,
      summary: "Reported $45 paid by venmo on Aug 20, 2026",
      refs: {},
    });

    check("the member who filed it is told nothing", (await rowsFor(plainMember._id, mark)).length, 0);
    const officerRows = await rowsFor(officerMember._id, mark);
    check("every officer gets exactly one", officerRows.length, 1);
    check("...on the officer template", officerRows[0]?.template, "officer_payment_submitted");
    check("...headlined as a queue item", officerRows[0]?.title, "New payment claim");
    check("...naming the member", officerRows[0]?.body.startsWith("Testy Member: "), true);
    check("...linking to the queue", officerRows[0]?.link, "/member/admin/dues/requests");
    check(
      "no audit row lands on an officer's own history",
      await FinanceEvent.countDocuments({ memberId: officerMember._id, createdAt: { $gte: mark } }),
      0
    );

    // --- 2. an officer acts on a member: both hear ---
    console.log("\nAn officer verifies that claim");
    mark = new Date();
    await announce({
      event: "payment_verified",
      memberId: plainMember._id,
      actorId: officerMember._id,
      amountCents: 4500,
      summary: "Verified $45 by venmo",
      refs: {},
      member: {
        template: "payment_verified",
        context: { amountCents: 4500, method: "venmo", reason: "Your balance is settled." },
      },
    });

    const memberRows = await rowsFor(plainMember._id, mark);
    check("the member is told once", memberRows.length, 1);
    check("...in the member's own words", memberRows[0]?.template, "payment_verified");
    check("...not the officer's", memberRows[0]?.title, "Payment confirmed");
    check("the officers still hear about it", (await rowsFor(officerMember._id, mark)).length, 1);
    check(
      "the member's history records that they were told",
      await FinanceEvent.countDocuments({
        memberId: plainMember._id, type: "reminder_sent", createdAt: { $gte: mark },
      }),
      1
    );

    // --- 3. the officer is the member: exactly one notification ---
    console.log("\nAn officer acts on an officer's own ledger");
    mark = new Date();
    await announce({
      event: "reimbursement_approved",
      memberId: officerMember._id,
      actorId: officerMember._id,
      amountCents: 2000,
      summary: "Approved $20 for Snacks",
      refs: {},
      member: {
        template: "reimbursement_approved",
        context: { amountCents: 2000, description: "Snacks" },
      },
    });

    const bothRows = await rowsFor(officerMember._id, mark);
    check("one notification, not two", bothRows.length, 1);
    check("...and it's the member-facing one", bothRows[0]?.template, "reimbursement_approved");

    // --- 4. the actor gets their own copy by default ---
    console.log("\nThe actor's own copy");
    mark = new Date();
    await announce({
      event: "plan_proposed",
      memberId: plainMember._id,
      actorId: officerMember._id,
      amountCents: 13500,
      summary: "Requested a 2-month plan for $135",
      refs: {},
    });
    check(
      "the officer who acted is told too (NOTIFY_SUPPRESS_ACTOR unset)",
      (await rowsFor(officerMember._id, mark)).length,
      1
    );

    process.env.NOTIFY_SUPPRESS_ACTOR = "1";
    mark = new Date();
    await announce({
      event: "plan_proposed",
      memberId: plainMember._id,
      actorId: officerMember._id,
      amountCents: 13500,
      summary: "Requested a 2-month plan for $135",
      refs: {},
    });
    check(
      "...and not told when NOTIFY_SUPPRESS_ACTOR=1",
      (await rowsFor(officerMember._id, mark)).length,
      0
    );
    delete process.env.NOTIFY_SUPPRESS_ACTOR;

    // --- 5. a batch is one notification, not one per member ---
    console.log("\nA sixty-member assignment");
    mark = new Date();
    await announceBulk({
      event: "charge_assigned",
      actorId: officerMember._id,
      amountCents: 1080000,
      summary: "$180 Chapter dues assigned to 60 members for Fall 2026, $10,800 in total",
    });
    check("officers get one line for the whole batch", (await rowsFor(officerMember._id, mark)).length, 1);
    check("members get nothing from the bulk path", (await rowsFor(plainMember._id, mark)).length, 0);

    // --- 6. transactional templates ignore the cooldown ---
    console.log("\nThe cooldown does not apply to ledger activity");
    mark = new Date();
    for (let i = 0; i < 3; i++) {
      await announce({
        event: "payment_submitted",
        memberId: plainMember._id,
        actorId: plainMember._id,
        amountCents: 100,
        summary: `Reported $1 paid by cash (${i})`,
        refs: {},
      });
    }
    check("three claims produce three officer notices", (await rowsFor(officerMember._id, mark)).length, 3);

    // --- 7. rendering ---
    console.log("\nRendering");
    const rendered = renderOfficerMessage({
      event: "reimbursement_submitted",
      memberName: "Vinny Panchal",
      actorName: "Vinny Panchal",
      summary: "Claimed $45 for Project Committee stuff",
    });
    check("title", rendered.title, "New reimbursement claim");
    check("body names the member and the actor", rendered.body,
      "Vinny Panchal: Claimed $45 for Project Committee stuff (by Vinny Panchal)");
    check("push stays under the iOS cutoff", rendered.push.length <= 120, true);
    check("category", rendered.category, "reimbursement");
    const unknown = renderOfficerMessage({ event: "not_a_real_event", memberName: "X", summary: "y" });
    check("an unmapped event still renders", unknown.title, "Ledger activity");
  } finally {
    // Everything this run created, on anyone's account.
    const scrub = { createdAt: { $gte: started } };
    const ids = [plainMember?._id, officerMember?._id].filter(Boolean);
    const n1 = await Notification.deleteMany({
      $or: [{ template: /^officer_/, ...scrub }, { memberId: { $in: ids } }],
    });
    const n2 = await FinanceEvent.deleteMany({ memberId: { $in: ids } });
    const n3 = await Member.deleteMany({ rollNo: { $regex: `^${TAG}` } });
    console.log(
      `\ncleanup: ${n1.deletedCount} notification(s), ${n2.deletedCount} event(s), ${n3.deletedCount} member(s)`
    );
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
