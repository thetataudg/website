import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { syncAllEvents } from "@/lib/calendar";

const CRON_SECRET = process.env.CALENDAR_SYNC_CRON_SECRET;

async function handleCron(req: Request) {
  if (!CRON_SECRET) {
    logger.error("CALENDAR_SYNC_CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Calendar cron secret is missing" },
      { status: 500 }
    );
  }

  const providedSecret = req.headers.get("x-calendar-sync-secret");
  if (providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const results = await syncAllEvents();
    const synced = results.filter((item) => item.status === "synced").length;
    return NextResponse.json(
      { status: "ok", total: results.length, synced },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Calendar cron sync failed");
    return NextResponse.json(
      { error: err?.message || "Calendar sync failed" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export async function POST(req: Request) {
  return handleCron(req);
}

export async function GET(req: Request) {
  return handleCron(req);
}
