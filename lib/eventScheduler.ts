// In-process scheduler for the server's recurring jobs.
//
// Production is a single Docker container on Coolify running `node
// server.js`, with no platform cron, so the server has to keep its own time.
// This is the only scheduler: nothing new goes in `netlify/`, which is legacy.
//
// Started once per server process from `instrumentation.ts`. One 60 s tick
// walks a small job list; each job has its own interval, its own last-run
// stamp, its own try/catch and Sentry tag, so one failing job never blocks
// the others. Everything a job calls must be idempotent (a rolling deploy can
// briefly run two containers).
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/logger";

const TICK_MS = 60 * 1000;
/// Long enough for the database connection and Sentry to be up, short enough
/// that a deploy does not leave a minute of stale events.
const FIRST_RUN_DELAY_MS = 10 * 1000;

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  {
    // Meetings move from scheduled to live to completed on their own.
    name: "event-lifecycle",
    everyMs: TICK_MS,
    run: async () => {
      const { advanceEventLifecycle } = await import("@/lib/eventLifecycle");
      await advanceEventLifecycle();
    },
  },
  {
    // Task tracker reminders and the Monday digest (lib/tasks/cron.ts).
    name: "tasks",
    everyMs: 15 * 60 * 1000,
    run: async () => {
      const { runTasksCron } = await import("@/lib/tasks/cron");
      const report = await runTasksCron(new Date());
      if (report.dueSoon || report.overdue || report.stale || report.digests) {
        logger.info({ report }, "Task reminders sent");
      }
    },
  },
];

const globalForScheduler = globalThis as unknown as {
  __eventSchedulerStarted?: boolean;
};

export function startEventScheduler() {
  // Next's dev server and hot reloads can evaluate this module more than once
  // in a process; the global flag keeps it to a single timer.
  if (globalForScheduler.__eventSchedulerStarted) return;
  globalForScheduler.__eventSchedulerStarted = true;

  const lastRun = new Map<string, number>();
  const running = new Set<string>();

  async function tick() {
    const now = Date.now();
    let connected = false;
    for (const job of JOBS) {
      // A slow database must not stack runs of the same job on each other.
      if (running.has(job.name)) continue;
      if (now - (lastRun.get(job.name) ?? 0) < job.everyMs - 1000) continue;
      running.add(job.name);
      lastRun.set(job.name, now);
      try {
        // Imported lazily: this keeps Mongoose and the models out of module
        // evaluation at boot, and out of `next build`'s page-data collection.
        if (!connected) {
          const { connectDB } = await import("@/lib/db");
          await connectDB();
          connected = true;
        }
        await job.run();
      } catch (err) {
        // Never let a failed job take the server down; the next tick retries.
        logger.error({ err, job: job.name }, "Scheduled job failed");
        Sentry.captureException(err, { tags: { job: job.name } });
      } finally {
        running.delete(job.name);
      }
    }
  }

  // `unref` so the timers never keep the process alive on shutdown.
  setTimeout(() => void tick(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void tick(), TICK_MS).unref();
  logger.info({ jobs: JOBS.map((j) => j.name) }, "In-process scheduler started");
}
