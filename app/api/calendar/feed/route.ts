// app/api/calendar/feed/route.ts
// The subscribable iCalendar feed. Reached by Apple Calendar, Google Calendar,
// and anything else that speaks webcal — none of which can send an
// Authorization header, so the signed token in the query string is the
// credential.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import { buildICS, verifyFeedToken } from "@/lib/calendarFeed";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const memberId = verifyFeedToken(token);
  if (!memberId) {
    return new NextResponse("Invalid or missing feed token", { status: 401 });
  }

  try {
    await connectDB();
    const member = await Member.findById(memberId).select("status").lean<any>();
    if (!member) {
      return new NextResponse("Unknown member", { status: 404 });
    }

    const filter: any = { status: { $ne: "cancelled" } };
    if (member.status === "Alumni") {
      filter.visibleToAlumni = true;
    }
    // A calendar subscription is a rolling window, not the whole archive —
    // a year back is plenty of history for any client.
    filter.startTime = {
      $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    };

    const events = await Event.find(filter).sort({ startTime: 1 }).lean();
    const body = buildICS(events as any[]);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="thetatau-dg.ics"',
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to build calendar feed");
    return new NextResponse("Failed to build calendar feed", { status: 500 });
  }
}
