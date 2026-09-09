// app/api/members/phone-sync/route.ts
//
// Pulls member phone numbers from Airtable and writes them onto the roster.
//
// Two actions, same shape as the family-tree importer: "validate" builds the
// plan and returns it for review, "commit" applies it. Nothing writes until
// somebody has seen the diff.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import Member from "@/lib/models/Member";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import { AirtableError, airtableConfig, fetchAirtableMembers } from "@/lib/airtable";
import {
  buildPhoneSyncPlan,
  normalizeRoll,
  pendingWrites,
  type SyncableMember,
} from "@/lib/phone-sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadPlan() {
  await connectDB();
  const members = await Member.find({}, { rollNo: 1, fName: 1, lName: 1, phone: 1 })
    .lean<SyncableMember[]>();
  const rows = await fetchAirtableMembers();
  return { plan: buildPhoneSyncPlan(members, rows), rowCount: rows.length };
}

export async function POST(req: Request) {
  // Checked before anything else so a misconfigured server says so plainly
  // rather than failing somewhere inside the fetch.
  if (!airtableConfig()) {
    return NextResponse.json(
      { error: "Airtable isn't configured on this server." },
      { status: 503 }
    );
  }

  let actor;
  try {
    actor = await requireChapterToolSubmitter(req);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized phone sync attempt");
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action !== "validate" && action !== "commit") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    // Rebuilt server-side on commit too. The client never submits a plan: a
    // forged one would be a roster-wide write, and a stale one would apply a
    // diff the reviewer never actually saw.
    const { plan, rowCount } = await loadPlan();

    if (action === "validate") {
      return NextResponse.json({
        fetchedAt: new Date().toISOString(),
        airtableRowCount: rowCount,
        plan,
      });
    }

    if (plan.duplicateRolls.length) {
      return NextResponse.json(
        {
          error: `Airtable has duplicate roll numbers (${plan.duplicateRolls.join(", ")}). Fix them there, then run the preview again.`,
        },
        { status: 409 }
      );
    }

    const writes = pendingWrites(plan);

    // The preview the reviewer approved has to be the one being applied.
    const expected = body?.expectedChanges;
    if (typeof expected === "number" && expected !== writes.length) {
      return NextResponse.json(
        {
          error: `Airtable changed since the preview (${writes.length} pending now, ${expected} when you reviewed). Run the preview again.`,
        },
        { status: 409 }
      );
    }

    if (!writes.length) {
      return NextResponse.json({ updated: 0, summary: plan });
    }

    // One round trip rather than several hundred. Deliberately no
    // `markWalletPassUpdatedForMember` — a phone number is not on the wallet
    // pass, and touching it here would queue a pass push for the whole chapter.
    const result = await Member.bulkWrite(
      writes.map((row) => ({
        updateOne: {
          filter: { rollNo: row.rollNo },
          update: { $set: { phone: row.incoming } },
        },
      }))
    );

    logger.info(
      {
        event: "Phone numbers synced from Airtable",
        by: actor.clerkId,
        rollNo: actor.submitter.rollNo,
        attempted: writes.length,
        modified: result.modifiedCount,
      },
      "Phone sync committed"
    );

    return NextResponse.json({
      updated: result.modifiedCount ?? writes.length,
      attempted: writes.length,
      summary: plan,
    });
  } catch (err: any) {
    if (err instanceof AirtableError) {
      logger.warn({ err: err.message }, "Airtable phone sync failed");
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err }, "Phone sync failed");
    return NextResponse.json({ error: "Phone sync failed." }, { status: 500 });
  }
}
