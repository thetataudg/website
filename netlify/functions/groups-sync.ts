import type { Handler } from "@netlify/functions";
import { connectDB } from "../../lib/db";
import logger from "../../lib/logger";
import { groupSyncEnabled, syncChapterGroups } from "../../lib/googleGroups";

export const config = {
  // 11:00 UTC is 4am in Phoenix, which has no daylight saving.
  schedule: "0 11 * * *",
};

export const handler: Handler = async () => {
  if (!groupSyncEnabled()) {
    return { statusCode: 200, body: JSON.stringify({ status: "disabled" }) };
  }
  try {
    await connectDB();
    const plans = await syncChapterGroups({ apply: true });
    return { statusCode: 200, body: JSON.stringify({ status: "ok", groups: plans }) };
  } catch (err: any) {
    logger.error({ err }, "Netlify scheduled Google Groups sync failed");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Groups sync failed" }),
    };
  }
};
