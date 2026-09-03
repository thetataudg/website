import type { Handler } from "@netlify/functions";
import { connectDB } from "../../lib/db";
import logger from "../../lib/logger";
import { syncAllEvents } from "../../lib/calendar";
import { autoCompleteStaleEvents } from "../../lib/eventLifecycle";
import { remindUpcomingEvents } from "../../lib/eventNotify";

export const config = {
  schedule: "*/10 * * * *", // every 10 minutes
};

const formatSummary = (results: { status: string }[]) => {
  const summary = results.reduce(
    (acc, item) => {
      if (item.status === "synced") acc.synced += 1;
      else if (item.status === "skipped") acc.skipped += 1;
      else if (item.status === "error") acc.errors += 1;
      return acc;
    },
    { synced: 0, skipped: 0, errors: 0 }
  );
  return summary;
};

export const handler: Handler = async () => {
  try {
    await connectDB();
    // Rides along with the sync rather than taking a schedule of its own: this
    // already runs every ten minutes, which is far finer than the three-hour
    // grace period the sweep works to.
    const closed = await autoCompleteStaleEvents();
    // Also rides along here. The half-hour warning wants a tick well inside
    // its own lead time, and ten minutes is the finest schedule already
    // running; a second scheduled function for one query would be a whole
    // moving part to buy nothing.
    const upcoming = await remindUpcomingEvents();
    const results = await syncAllEvents();
    const summary = formatSummary(results);
    logger.info(
      { ...summary, ...closed, ...upcoming },
      "Netlify scheduled calendar sync completed"
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        total: results.length,
        ...summary,
        ...closed,
        ...upcoming,
      }),
    };
  } catch (err: any) {
    logger.error({ err }, "Netlify scheduled calendar sync failed");
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err?.message || "Calendar sync failed",
      }),
    };
  }
};
