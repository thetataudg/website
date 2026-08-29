// app/api/events/[id]/rsvp/route.ts
// Who says they're coming. Kept separate from `attendees` — that's who
// actually checked in, and only check-ins count toward GEM.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { maybePresignUrl } from "@/lib/garage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["going", "maybe", "not_going"] as const;
type Status = (typeof STATUSES)[number];

async function getViewer(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId })
    .select("_id status")
    .lean<any>();
  if (!member) {
    const err: any = new Error("Profile not found");
    err.statusCode = 404;
    throw err;
  }
  return member;
}

/// Shapes the response both GET and PUT return, so the client never has to
/// reconcile two different payloads for the same screen.
async function buildSummary(event: any, viewerId: string) {
  const rsvps = Array.isArray(event.rsvps) ? event.rsvps : [];
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];

  const rsvpIds = rsvps.map((entry: any) => entry.memberId).filter(Boolean);
  const attendeeIds = attendees
    .map((entry: any) => entry?.memberId)
    .filter(Boolean);

  const everyone = await Member.find({
    _id: { $in: [...rsvpIds, ...attendeeIds] },
  })
    .select("rollNo fName lName profilePicUrl")
    .lean<any[]>();

  const byId = new Map(everyone.map((member) => [member._id.toString(), member]));

  const describe = async (memberId: any, extra: Record<string, any> = {}) => {
    const member = byId.get(memberId?.toString());
    if (!member) return null;
    return {
      memberId: member._id.toString(),
      rollNo: member.rollNo,
      fName: member.fName,
      lName: member.lName,
      profilePicUrl: await maybePresignUrl(member.profilePicUrl),
      ...extra,
    };
  };

  const responses = (
    await Promise.all(
      rsvps.map((entry: any) =>
        describe(entry.memberId, {
          status: entry.status,
          respondedAt: entry.respondedAt
            ? new Date(entry.respondedAt).toISOString()
            : null,
        })
      )
    )
  ).filter(Boolean);

  const checkedIn = (
    await Promise.all(
      attendees.map((entry: any) =>
        describe(entry?.memberId, {
          checkedInAt: entry?.checkedInAt
            ? new Date(entry.checkedInAt).toISOString()
            : null,
          // How they got on the list, so the door roster can say which tag
          // somebody tapped rather than just that they appeared.
          source: entry?.source ?? null,
          boothLabel: entry?.boothLabel ?? null,
        })
      )
    )
  ).filter(Boolean);

  const counts = STATUSES.reduce(
    (acc, status) => ({
      ...acc,
      [status]: responses.filter((entry: any) => entry.status === status).length,
    }),
    {} as Record<Status, number>
  );

  const mine = rsvps.find(
    (entry: any) => entry.memberId?.toString() === viewerId
  );

  return {
    eventId: event._id.toString(),
    mine: mine?.status ?? null,
    counts,
    responses,
    checkedIn,
    checkedInCount: checkedIn.length,
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let viewer;
  try {
    viewer = await getViewer(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  try {
    const event = await Event.findById(params.id).lean<any>();
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (viewer.status === "Alumni" && event.visibleToAlumni === false) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      await buildSummary(event, viewer._id.toString()),
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err, eventId: params.id }, "Failed to read RSVPs");
    return NextResponse.json({ error: "Failed to read RSVPs" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  let viewer;
  try {
    viewer = await getViewer(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = body?.status;
  // `null` clears the response — "I haven't decided" is a real answer, and
  // it has to be distinguishable from "not going".
  const clearing = raw === null || raw === "none" || raw === undefined;
  if (!clearing && !STATUSES.includes(raw)) {
    return NextResponse.json(
      { error: `status must be one of ${STATUSES.join(", ")}, or null to clear` },
      { status: 400 }
    );
  }

  try {
    const event = await Event.findById(params.id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (viewer.status === "Alumni" && event.visibleToAlumni === false) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const viewerId = viewer._id.toString();
    // Rebuilt as a plain array rather than mutated in place: if the registered
    // schema predates `rsvps`, the path is undefined and `.push` on it throws.
    const remaining = (event.rsvps || []).filter(
      (entry: any) => entry.memberId?.toString() !== viewerId
    );
    if (!clearing) {
      remaining.push({
        memberId: viewer._id,
        status: raw,
        respondedAt: new Date(),
      });
    }
    event.set("rsvps", remaining);
    await event.save();

    logger.info(
      { eventId: params.id, memberId: viewerId, status: clearing ? null : raw },
      "RSVP recorded"
    );

    return NextResponse.json(
      await buildSummary(event.toObject(), viewerId),
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err, eventId: params.id }, "Failed to record RSVP");
    return NextResponse.json({ error: "Failed to record RSVP" }, { status: 500 });
  }
}
