// A member checking themselves in by tapping an NFC tag.
//
// Every other check-in path is officer-driven: somebody with a role scans a
// member's code, or adds them by hand. This is the first one where a member
// writes their own attendance row, and the booth token is what stands in for
// the officer's judgement — so the token is the *only* thing read from the
// request. The member being checked in is always the caller, never an id in
// the body, because a body-supplied id would let anyone with a valid tag check
// in the whole chapter.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { getMemberByClerk } from "@/lib/checkinAuth";
import { AUTO_COMPLETE_GRACE_MS } from "@/lib/eventLifecycle";

/** How early a tag starts working, for the queue that forms before the door. */
const EARLY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Crude per-member throttle.
 *
 * There is no rate-limit helper anywhere in this codebase because until now
 * every write endpoint needed a role. This one doesn't, so a member holding
 * their phone against a tag — which fires a scan per second — shouldn't turn
 * into a write per second. Per-instance and in-memory, which is enough for
 * what it defends against; it is not a security boundary.
 */
const lastAttempt = new Map<string, number>();
const THROTTLE_MS = 2000;

function throttled(memberId: string) {
  const now = Date.now();
  const previous = lastAttempt.get(memberId);
  if (previous && now - previous < THROTTLE_MS) return true;
  lastAttempt.set(memberId, now);

  // The map is only ever as big as the people who checked in recently.
  if (lastAttempt.size > 500) {
    for (const [key, at] of lastAttempt) {
      if (now - at > 60_000) lastAttempt.delete(key);
    }
  }
  return false;
}

/**
 * Failures carry a `reason` alongside the message.
 *
 * The iOS client never shows server text — `APIError` deliberately swallows it
 * so an internal message can't leak into the UI — but "the tag is stale" and
 * "you're too early" need different words in front of a member standing at a
 * door. The code is what the app maps to its own copy; the string is what the
 * web page shows, which has no such rule.
 */
export async function POST(req: Request) {
  try {
    const actor = await getMemberByClerk(req);

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    if (throttled(actor._id?.toString() || "")) {
      return NextResponse.json(
        { error: "Give it a second and tap again.", reason: "throttled" },
        { status: 429 }
      );
    }

    await connectDB();
    const event = await Event.collection.findOne({
      "checkInBooths.token": token,
    });
    if (!event) {
      return NextResponse.json(
        {
          error: "This check-in tag isn't set up for an event right now.",
          reason: "unknown-tag",
        },
        { status: 404 }
      );
    }

    const booth = (event.checkInBooths || []).find(
      (entry: any) => entry.token === token
    );

    if (event.status !== "ongoing") {
      return NextResponse.json(
        { error: "This event isn't accepting check-ins.", reason: "not-open" },
        { status: 400 }
      );
    }

    // Belt and braces behind the status check: the sweep that auto-completes
    // stale events only runs every ten minutes, so there is a window where a
    // finished event is still `ongoing`.
    const now = Date.now();
    const opensAt = new Date(event.startTime).getTime() - EARLY_WINDOW_MS;
    const closesAt = new Date(event.endTime).getTime() + AUTO_COMPLETE_GRACE_MS;
    if (now < opensAt) {
      return NextResponse.json(
        { error: "Check-in for this event hasn't opened yet.", reason: "too-early" },
        { status: 400 }
      );
    }
    if (now > closesAt) {
      return NextResponse.json(
        { error: "Check-in for this event has closed.", reason: "too-late" },
        { status: 400 }
      );
    }

    if (actor.status && actor.status !== "Active") {
      return NextResponse.json(
        { error: "Your membership isn't active for check-in.", reason: "inactive" },
        { status: 403 }
      );
    }

    if (event.attendees && !Array.isArray(event.attendees)) {
      await Event.collection.updateOne(
        { _id: event._id },
        { $set: { attendees: [] } }
      );
    }

    const memberId = new mongoose.Types.ObjectId(actor._id);
    const update = await Event.collection.updateOne(
      { _id: event._id, "attendees.memberId": { $ne: memberId } },
      {
        $push: {
          attendees: {
            memberId,
            checkedInAt: new Date(),
            source: "NFC",
            scannerMemberId: null,
            boothToken: token,
            boothLabel: booth?.label || null,
          },
        },
      } as any
    );

    const payload = {
      event: { id: event._id.toString(), name: event.name },
      booth: { label: booth?.label || "" },
    };

    if (update.matchedCount === 0) {
      return NextResponse.json(
        { status: "already-checked-in", ...payload },
        { status: 200 }
      );
    }

    logger.info(
      {
        eventId: event._id,
        memberId: actor._id?.toString(),
        booth: booth?.label,
      },
      "Checked in member via NFC booth"
    );
    return NextResponse.json({ status: "checked-in", ...payload }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed NFC booth check-in");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
