// app/api/terminal/config/route.ts
// What the phone needs to know before it can connect a Tap to Pay reader.
import { NextResponse } from "next/server";
import { requireTerminalOperator } from "@/lib/duesAuth";
import {
  stripeIsConfigured,
  terminalLocationId,
  terminalPaymentsEnabled,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!stripeIsConfigured()) {
    return NextResponse.json(
      { error: "Card payments are not configured" },
      { status: 503 }
    );
  }
  if (!terminalPaymentsEnabled()) {
    return NextResponse.json(
      {
        error:
          "In-person card payments aren't switched on yet. Record the payment by hand for now.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({
    locationId: terminalLocationId(),
    merchantDisplayName: "Theta Tau Delta Gamma",
    currency: "USD",
    countryCode: "US",
  });
}
