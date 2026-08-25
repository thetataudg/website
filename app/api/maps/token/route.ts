import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/clerk";
import logger from "@/lib/logger";
import { mapkitToken } from "@/lib/mapkitToken";

export const dynamic = "force-dynamic";

/**
 * The MapKit JS token, handed to a signed-in member's browser.
 *
 * Behind auth even though the token itself is meant to reach a browser: it is
 * this chapter's Apple Maps quota, and there is no reason for it to be
 * readable by anyone who is not already inside the members' site.
 */
export async function GET(req: Request) {
  try {
    await requireAuth(req as any);

    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost || req.headers.get("host") || new URL(req.url).host;
    const hostname = requestHost.split(":")[0];
    const token = mapkitToken(hostname);
    if (!token) {
      return NextResponse.json(
        { error: "Apple Maps is not configured on this deployment." },
        { status: 503 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (token.expiresAt && token.expiresAt <= now) {
      logger.warn(
        { source: token.source },
        "MapKit JS token has expired; set MAPKIT_PRIVATE_KEY/KEY_ID/TEAM_ID so tokens mint themselves"
      );
      return NextResponse.json(
        { error: "The Apple Maps token has expired. Ask an admin to refresh it." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { token: token.token, expiresAt: token.expiresAt },
      // Never at the edge: a token cached publicly outlives the session it was
      // issued for. Private and short, so one member's tab reuses it.
      { headers: { "Cache-Control": "private, max-age=120" } }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to issue a MapKit JS token");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
