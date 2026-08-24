import type { Handler } from "@netlify/functions";
import { connectDB } from "../../lib/db";
import logger from "../../lib/logger";
import { runDuesCron } from "../../lib/duesCron";

export const config = {
  // 16:00 UTC is 9am in Phoenix year-round — Arizona doesn't observe daylight
  // saving, which is the one thing that makes this schedule simple.
  schedule: "0 16 * * *",
};

export const handler: Handler = async () => {
  try {
    await connectDB();
    const report = await runDuesCron();
    logger.info(report, "Netlify scheduled dues cron completed");
    return { statusCode: 200, body: JSON.stringify({ status: "ok", ...report }) };
  } catch (err: any) {
    logger.error({ err }, "Netlify scheduled dues cron failed");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Dues cron failed" }),
    };
  }
};
