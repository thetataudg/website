// app/api/tasks/cron/route.ts
// Optional manual trigger for the task reminders. The real schedule is the
// in-process ticker (lib/eventScheduler.ts); this exists for testing.
//
// Guarded by TASKS_CRON_SECRET (a Coolify environment variable) in the
// `x-tasks-cron-secret` header. Unset means the route is off. Safe to call
// repeatedly: every reminder is claimed before it is sent.
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { runTasksCron } from "@/lib/tasks/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.TASKS_CRON_SECRET;
  const given = req.headers.get("x-tasks-cron-secret") || "";
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!process.env.TASKS_CRON_SECRET) {
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const report = await runTasksCron(new Date());
    logger.info(report, "Tasks cron completed");
    return NextResponse.json({ status: "ok", ...report });
  } catch (err: any) {
    logger.error({ err }, "Tasks cron failed");
    return NextResponse.json({ error: "Tasks cron failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
