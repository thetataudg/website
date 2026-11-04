// Next calls `register` once per server runtime at startup. This is where the
// Node and edge halves of Sentry start; the browser half is
// sentry.client.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Events start and finish on the clock, and in production nothing outside
    // this process is going to do it (see lib/eventScheduler.ts). Not during
    // `next build`, which also runs `register` while collecting page data and
    // must not open a database connection or leave a timer behind. Production
    // only by default so a laptop pointed at a shared database does not start
    // flipping real events; ENABLE_EVENT_SCHEDULER=1 turns it on elsewhere and
    // DISABLE_EVENT_SCHEDULER=1 turns it off in production.
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    const enabled =
      (process.env.NODE_ENV === "production" ||
        process.env.ENABLE_EVENT_SCHEDULER === "1") &&
      process.env.DISABLE_EVENT_SCHEDULER !== "1";
    if (!isBuild && enabled) {
      const { startEventScheduler } = await import("./lib/eventScheduler");
      startEventScheduler();
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
