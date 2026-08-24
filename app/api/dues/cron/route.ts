// app/api/dues/cron/route.ts
// The nightly job's front door. Mirrors app/api/calendar/cron/route.ts, which
// is the pattern this project already trusts for scheduled work.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { runDuesCron } from "@/lib/duesCron";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sixty members across three channels doesn't finish in the default window.
export const maxDuration = 300;

const CRON_SECRET = process.env.DUES_CRON_SECRET;

async function handleCron(req: Request) {
  if (!CRON_SECRET) {
    logger.error("DUES_CRON_SECRET is not configured");
    return NextResponse.json({ error: "Dues cron secret is missing" }, { status: 500 });
  }
  if (req.headers.get("x-dues-cron-secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const report = await runDuesCron();
    logger.info(report, "Dues cron completed");
    return NextResponse.json({ status: "ok", ...report }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Dues cron failed");
    return NextResponse.json({ error: err?.message || "Dues cron failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleCron(req);
}

export async function GET(req: Request) {
  return handleCron(req);
}
