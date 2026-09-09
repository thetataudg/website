// app/api/app-version/route.ts
//
// What version the iOS app should be on. Read at every launch.
//
// Public on purpose: the gate has to run before anyone signs in, and the
// payload is three constants that are already public knowledge.

import { NextResponse } from "next/server";
import {
  APP_STORE_APP_ID,
  APP_STORE_URL,
  LATEST_IOS_VERSION,
} from "@/lib/appVersion";
import { resolveMinimumIosVersion } from "@/lib/appVersionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const minimum = await resolveMinimumIosVersion();

  return NextResponse.json(
    {
      ios: {
        minimum: minimum.version,
        latest: LATEST_IOS_VERSION,
        // Served rather than hardcoded in the app, so the destination can be
        // corrected without shipping a build to the people who cannot update.
        storeUrl: APP_STORE_URL,
        appStoreId: APP_STORE_APP_ID,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
