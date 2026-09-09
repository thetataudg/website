// app/api/availability/cron/route.ts
// The availability sweep's front door. Mirrors app/api/dues/cron/route.ts: a
// shared secret in a header, and the same logic the Netlify schedule runs, so
// a run can be triggered by hand for testing without waiting for the hour.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { runAvailabilityCron } from "@/lib/availability/cron";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.AVAILABILITY_CRON_SECRET;

async function handleCron(req: Request) {
  if (!CRON_SECRET) {
    logger.error("AVAILABILITY_CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Availability cron secret is missing" },
      { status: 500 }
    );
  }
  if (req.headers.get("x-availability-cron-secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const report = await runAvailabilityCron();
    logger.info(report, "Availability cron completed");
    return NextResponse.json({ status: "ok", ...report }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Availability cron failed");
    return NextResponse.json(
      { error: err?.message || "Availability cron failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return handleCron(req);
}

export async function GET(req: Request) {
  return handleCron(req);
}
