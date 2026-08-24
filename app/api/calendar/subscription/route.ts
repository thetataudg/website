// app/api/calendar/subscription/route.ts
// Hands the signed-in member their own feed URL. Separate from the feed itself
// because *this* one is a normal authenticated call — only the feed has to be
// reachable by a calendar client.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { createFeedToken } from "@/lib/calendarFeed";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const token = createFeedToken(member._id.toString());
    // Built from the incoming request so it works behind ngrok, Netlify, or a
    // custom domain without another environment variable to keep in sync.
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
      || new URL(req.url).origin;
    const path = `/api/calendar/feed?token=${encodeURIComponent(token)}`;

    return NextResponse.json(
      {
        httpsUrl: `${origin}${path}`,
        // `webcal://` is what makes iOS and macOS offer to *subscribe* rather
        // than download a one-off snapshot.
        webcalUrl: `${origin.replace(/^https?:/, "webcal:")}${path}`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to build calendar subscription URL");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
