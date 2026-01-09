import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Event from "@/lib/models/Event";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();

    const member = await Member.findOne({ clerkId }).lean();
    if (!member || Array.isArray(member)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const event = await Event.findById(params.id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (member.status === "Alumni" && !event.visibleToAlumni) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const memberId = member._id?.toString();
    const already = event.attendees.some(
      (id: any) => id.toString() === memberId
    );

    if (already) {
      event.attendees = event.attendees.filter(
        (id: any) => id.toString() !== memberId
      );
    } else {
      event.attendees.push(member._id);
    }

    await event.save();

    return NextResponse.json(
      { attending: !already, attendeeCount: event.attendees.length },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to toggle attendance");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
