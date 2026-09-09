// app/api/admin/app-version/route.ts
//
// Reads and sets the minimum iOS version the app will accept.
//
// Separate from the public `/api/app-version`, which the app itself reads: this
// one is gated, and it also reports what versions members are actually running
// so nobody raises the floor blind.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import DeviceToken from "@/lib/models/DeviceToken";
import AppVersionSetting from "@/lib/models/AppVersionSetting";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import {
  LATEST_IOS_VERSION,
  MINIMUM_IOS_VERSION,
  compareVersions,
  isValidVersionString,
} from "@/lib/appVersion";
import { resolveMinimumIosVersion } from "@/lib/appVersionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Devices seen in the last 60 days, grouped by the version they last reported.
///
/// This is the safeguard on the whole feature. Raising the floor above what
/// people are running locks them out with no way forward but the App Store, so
/// the number of devices about to be blocked is put in front of whoever is
/// about to do it.
async function versionBreakdown() {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const rows = await DeviceToken.aggregate([
    { $match: { lastSeenAt: { $gte: since } } },
    { $group: { _id: { $ifNull: ["$appVersion", ""] }, devices: { $sum: 1 } } },
    { $sort: { devices: -1 } },
  ]);
  return rows.map((r: any) => ({
    version: String(r._id || "unknown"),
    devices: r.devices as number,
  }));
}

export async function GET(req: Request) {
  try {
    await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  const [current, breakdown] = await Promise.all([
    resolveMinimumIosVersion(),
    versionBreakdown(),
  ]);

  return NextResponse.json({
    current,
    codeDefault: MINIMUM_IOS_VERSION,
    latest: LATEST_IOS_VERSION,
    breakdown,
  });
}

export async function PUT(req: Request) {
  let actor;
  try {
    actor = await requireChapterToolSubmitter(req);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized minimum-version change");
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  const body = await req.json().catch(() => ({}));

  // Clearing hands control back to the code constant rather than deleting the
  // floor entirely.
  if (body?.reset === true) {
    await connectDB();
    await AppVersionSetting.deleteOne({ key: "ios" });
    logger.info(
      { by: actor.clerkId, rollNo: actor.submitter.rollNo },
      "Minimum iOS version reset to the code default"
    );
    return NextResponse.json({ current: await resolveMinimumIosVersion() });
  }

  const version = String(body?.minimumVersion ?? "").trim();
  if (!isValidVersionString(version)) {
    return NextResponse.json(
      { error: "Enter a version like 1.2 or 1.2.1 — digits and dots only." },
      { status: 400 }
    );
  }

  await connectDB();

  // Anything that would block a device currently in use has to be asked for
  // explicitly. The client sends `confirmBlocking` only after showing the
  // count, so a mistyped "11" instead of "1.1" cannot lock the chapter out in
  // one click.
  if (body?.confirmBlocking !== true) {
    const breakdown = await versionBreakdown();
    const blocked = breakdown
      .filter((row) => row.version !== "unknown" && compareVersions(row.version, version) < 0)
      .reduce((sum, row) => sum + row.devices, 0);
    if (blocked > 0) {
      return NextResponse.json(
        {
          error: `That would block ${blocked} device${blocked === 1 ? "" : "s"} currently in use.`,
          requiresConfirmation: true,
          blockedDevices: blocked,
        },
        { status: 409 }
      );
    }
  }

  const name = [actor.submitter.fName, actor.submitter.lName].filter(Boolean).join(" ");
  await AppVersionSetting.findOneAndUpdate(
    { key: "ios" },
    {
      $set: {
        minimumVersion: version,
        updatedBy: actor.clerkId,
        updatedByName: name,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(
    { by: actor.clerkId, rollNo: actor.submitter.rollNo, version },
    "Minimum iOS version updated"
  );

  return NextResponse.json({ current: await resolveMinimumIosVersion() });
}
