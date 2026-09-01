// app/api/donations/config/route.ts
// What the app needs before it can show a give screen.
//
// Also the switch that decides whether it shows one at all. App Review
// guideline 3.2.2(iv) restricts in-app fundraising to Apple-approved
// nonprofits, so if review ever objects the server can turn the native screen
// off and the app falls back to opening the website, with no resubmission.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { donationDesignationOptions } from "@/lib/donations";
import {
  appDonationsEnabled,
  stripeIsConfigured,
  stripePublishableKey,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  const enabled = appDonationsEnabled() && stripeIsConfigured();
  return NextResponse.json({
    // False means "send them to the website instead", not "hide giving".
    enabled,
    publishableKey: enabled ? stripePublishableKey() : "",
    merchantIdentifier:
      process.env.STRIPE_APPLE_MERCHANT_ID ?? "merchant.org.thetatau.dg.ThetaTau",
    merchantCountryCode: "US",
    designations: donationDesignationOptions(),
    minAmountCents: 100,
    maxAmountCents: 1_000_000,
  });
}
