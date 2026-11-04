// In-process scheduler for the event lifecycle.
//
// Production is a single Docker container running `node server.js`, with no
// platform cron and none of the cron secrets set, so the Netlify function and
// the cron route that used to drive the sweep never ran there: meetings from
// months ago still said "scheduled". The server has to keep its own time.
//
// Started once per server process from `instrumentation.ts`. Everything it
// calls is idempotent (see `advanceEventLifecycle`), so running it alongside
// the Netlify function or the cron route, or in two containers during a
// rolling deploy, is harmless.
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/logger";

const TICK_MS = 60 * 1000;
/// Long enough for the database connection and Sentry to be up, short enough
/// that a deploy does not leave a minute of stale events.
const FIRST_RUN_DELAY_MS = 10 * 1000;

const globalForScheduler = globalThis as unknown as {
  __eventSchedulerStarted?: boolean;
};

export function startEventScheduler() {
  // Next's dev server and hot reloads can evaluate this module more than once
  // in a process; the global flag keeps it to a single timer.
  if (globalForScheduler.__eventSchedulerStarted) return;
  globalForScheduler.__eventSchedulerStarted = true;

  let running = false;

  async function tick() {
    // A slow database must not stack ticks on top of each other.
    if (running) return;
    running = true;
    try {
      // Imported lazily: this keeps Mongoose and the models out of module
      // evaluation at boot, and out of `next build`'s page-data collection.
      const { connectDB } = await import("@/lib/db");
      const { advanceEventLifecycle } = await import("@/lib/eventLifecycle");
      await connectDB();
      await advanceEventLifecycle();
    } catch (err) {
      // Never let a failed tick take the server down; the next one retries.
      logger.error({ err }, "Event lifecycle tick failed");
      Sentry.captureException(err, { tags: { job: "event-lifecycle" } });
    } finally {
      running = false;
    }
  }

  // `unref` so the timers never keep the process alive on shutdown.
  setTimeout(() => void tick(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void tick(), TICK_MS).unref();
  logger.info("Event lifecycle scheduler started");
}
