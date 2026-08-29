// Arming, listing, and tearing down the NFC check-in tags for one event.
//
// "Arming" mints a token, hands back the URL the officer's phone writes to a
// tag, and opens the door — an officer who is standing at the event setting up
// a tag is starting the event, the same way opening the scanner does.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { boothUrl, generateBoothToken } from "@/lib/checkinCode";
import { canManageCheckIn, getMemberByClerk, toEventId } from "@/lib/checkinAuth";

function serializeBooth(booth: any) {
  return {
    token: booth.token,
    label: booth.label || "",
    armedAt: booth.armedAt,
    armedBy: booth.armedBy ? booth.armedBy.toString() : null,
    url: boothUrl(booth.token),
  };
}

async function loadForOfficer(req: Request, id: string) {
  const actor = await getMemberByClerk(req);
  const eventId = toEventId(id);
  if (!eventId) return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) };

  await connectDB();
  const event = await Event.collection.findOne({ _id: eventId });
  if (!event) {
    return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  }
  if (!(await canManageCheckIn(actor, event))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { actor, eventId, event };
}

/** The tags already armed for this event, so the setup screen can list them. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const loaded = await loadForOfficer(req, params.id);
    if (loaded.error) return loaded.error;

    const booths = (loaded.event!.checkInBooths || []).map(serializeBooth);
    return NextResponse.json({ booths, status: loaded.event!.status }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list check-in booths");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const loaded = await loadForOfficer(req, params.id);
    if (loaded.error) return loaded.error;
    const { actor, eventId, event } = loaded as any;

    if (event.status === "cancelled") {
      return NextResponse.json(
        { error: "This event was cancelled." },
        { status: 400 }
      );
    }

    let label = "";
    try {
      const body = await req.json();
      if (body && typeof body.label === "string") label = body.label.trim();
    } catch {
      // Body is optional — a tag with no name is still a working tag.
    }
    if (!label) {
      label = `Tag ${(event.checkInBooths?.length || 0) + 1}`;
    }
    if (label.length > 60) label = label.slice(0, 60);

    const token = generateBoothToken();
    const armedAt = new Date();

    // Setting up a tag *is* starting the event. `startedAt` is only stamped
    // once, matching how PATCH /api/events/[id] treats it.
    const set: Record<string, unknown> = {};
    if (event.status !== "ongoing") set.status = "ongoing";
    if (!event.startedAt) set.startedAt = armedAt;
    // An event that was completed and is being reopened should not keep the
    // moment it stopped.
    if (event.status === "completed") set.endedAt = null;

    await Event.collection.updateOne(
      { _id: eventId },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        $push: {
          checkInBooths: {
            token,
            label,
            armedAt,
            armedBy: actor._id || null,
          },
        },
      } as any
    );

    logger.info(
      { eventId, label, armedBy: actor._id?.toString() },
      "Armed NFC check-in booth"
    );

    return NextResponse.json(
      {
        token,
        label,
        url: boothUrl(token),
        event: {
          id: eventId.toString(),
          name: event.name,
          startTime: event.startTime,
          endTime: event.endTime,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to arm check-in booth");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

/**
 * Retires a tag. With a token, just that one; without, every tag on the event.
 *
 * Ending check-in clears them all, so a tag left on a table stops working the
 * moment the door closes rather than at whatever hour the sweep gets to it.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const loaded = await loadForOfficer(req, params.id);
    if (loaded.error) return loaded.error;
    const { eventId } = loaded as any;

    let token: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.token === "string") token = body.token;
    } catch {
      // No body means "all of them".
    }

    if (token) {
      await Event.collection.updateOne(
        { _id: eventId },
        { $pull: { checkInBooths: { token } } } as any
      );
    } else {
      await Event.collection.updateOne(
        { _id: eventId },
        { $set: { checkInBooths: [] } }
      );
    }

    logger.info({ eventId, token: token ? "one" : "all" }, "Retired check-in booth");
    return NextResponse.json({ status: "retired" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to retire check-in booth");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
