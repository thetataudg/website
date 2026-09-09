// app/api/availability/[id]/schedule/route.ts
// POST - manager only. Take the chosen slot and create the chapter's own
//        Event, which is where this whole feature pays off: the same
//        `createEvent` the events route uses, so calendar sync, ICS feeds, RSVP
//        and the published push all come along for free.
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { scheduleFromPoll } from "@/lib/availability/service";
import { currentMember, loadPollContext } from "@/lib/availability/routeHelpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await currentMember(req);
    const ctx = await loadPollContext(params.id, member);
    if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!ctx.isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.startISO || !body.endISO) {
      return NextResponse.json(
        { error: "startISO and endISO are required" },
        { status: 400 }
      );
    }

    const event = await scheduleFromPoll(
      ctx.poll,
      {
        startISO: body.startISO,
        endISO: body.endISO,
        location: body.location,
        locationKind: body.locationKind,
        virtualPlatform: body.virtualPlatform,
        virtualLink: body.virtualLink,
        eventType: body.eventType,
        gemCategory: body.gemCategory,
        recurrence: body.recurrence,
      },
      member._id
    );

    return NextResponse.json({ event }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to schedule from availability poll");
    const status = /valid|already has an event/i.test(err.message || "")
      ? 400
      : 403;
    return NextResponse.json({ error: err.message }, { status });
  }
}
