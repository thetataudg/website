import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import {
  onlineDuesPaymentsEnabled,
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
  if (!onlineDuesPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Online payments are coming soon. Please use an offline payment method for now." },
      { status: 503 }
    );
  }
  if (!stripeIsConfigured()) {
    return NextResponse.json({ error: "Online payments are not configured" }, { status: 503 });
  }
  return NextResponse.json({
    publishableKey: stripePublishableKey(),
    merchantIdentifier:
      process.env.STRIPE_APPLE_MERCHANT_ID ?? "merchant.org.thetatau.dg.ThetaTau",
    merchantCountryCode: "US",
    currency: "USD",
  });
}
