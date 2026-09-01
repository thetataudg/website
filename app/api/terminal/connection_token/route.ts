// app/api/terminal/connection_token/route.ts
// The most sensitive endpoint in the treasury.
//
// A Terminal connection token authorizes its holder to connect a reader and
// take payments on the chapter's Stripe account. It is not scoped to an amount
// or to a member. So: Treasurer and admin only, POST only so it cannot be
// triggered by a link, no caching, and every issue is logged with the officer's
// id so there is a record of who could have taken money and when.
import { NextResponse } from "next/server";
import { requireTerminalOperator } from "@/lib/duesAuth";
import { getStripe, terminalPaymentsEnabled } from "@/lib/stripe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let viewer;
  try {
    viewer = await requireTerminalOperator(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  if (!terminalPaymentsEnabled()) {
    return NextResponse.json(
      { error: "In-person card payments aren't switched on yet" },
      { status: 503 }
    );
  }

  try {
    const token = await getStripe().terminal.connectionTokens.create();
    logger.info(
      { operatorId: String(viewer._id), rollNo: viewer.rollNo },
      "Issued a Stripe Terminal connection token"
    );
    return NextResponse.json(
      { secret: token.secret },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    logger.error({ err, operatorId: String(viewer._id) }, "Connection token failed");
    return NextResponse.json(
      { error: "Couldn't start a reader session" },
      { status: 502 }
    );
  }
}
