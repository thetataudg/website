import type { Handler } from "@netlify/functions";
import { connectDB } from "../../lib/db";
import logger from "../../lib/logger";
import { runAvailabilityCron } from "../../lib/availability/cron";

export const config = {
  // Hourly. The job checks the Phoenix hour itself and does nothing but close
  // overdue polls outside 8am-9pm, so the schedule can be blunt.
  schedule: "0 * * * *",
};

export const handler: Handler = async () => {
  try {
    await connectDB();
    const report = await runAvailabilityCron();
    logger.info(report, "Netlify scheduled availability cron completed");
    return { statusCode: 200, body: JSON.stringify({ status: "ok", ...report }) };
  } catch (err: any) {
    logger.error({ err }, "Netlify scheduled availability cron failed");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Availability cron failed" }),
    };
  }
};
