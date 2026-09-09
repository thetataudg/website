// app/api/availability/[id]/response/route.ts
// PUT - one invitee paints their own grid. Self only; an invitee cannot answer
//       for anyone else.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import logger from "@/lib/logger";
import { gridShape } from "@/lib/availability/solve";
import { currentMember, loadPollContext } from "@/lib/availability/routeHelpers";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await currentMember(req);
    const ctx = await loadPollContext(params.id, member);
    if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!ctx.isInvitee) {
      return NextResponse.json(
        { error: "You are not on this poll" },
        { status: 403 }
      );
    }
    if (ctx.poll.status !== "open") {
      return NextResponse.json(
        { error: "This poll is closed" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const raw = Array.isArray(body.slots) ? body.slots : [];
    const { slotsPerDay } = gridShape(ctx.poll);
    const columns =
      ctx.poll.dateMode === "weekdays"
        ? (ctx.poll.weekdays || []).length
        : (ctx.poll.dates || []).length;
    const maxIndex = slotsPerDay * columns;
    const slots = Array.from(
      new Set<number>(
        raw
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n >= 0 && n < maxIndex)
      )
    ).sort((a, b) => a - b);

    const memberId = new mongoose.Types.ObjectId(member._id);
    const now = new Date();

    // Replace this member's row in place, or push a new one.
    const updated = await AvailabilityPoll.findOneAndUpdate(
      { _id: params.id, "responses.memberId": memberId },
      {
        $set: {
          "responses.$.slots": slots,
          "responses.$.updatedAt": now,
          "responses.$.source": "manual",
        },
      },
      { new: true }
    ).lean<any>();

    let result = updated;
    if (!updated) {
      result = await AvailabilityPoll.findByIdAndUpdate(
        params.id,
        {
          $push: {
            responses: { memberId, slots, updatedAt: now, source: "manual" },
          },
        },
        { new: true }
      ).lean<any>();
    }

    return NextResponse.json(
      {
        ok: true,
        slots,
        respondedCount: (result?.responses || []).filter(
          (r: any) => r.source !== "prefill"
        ).length,
        inviteeCount: (result?.invitees || []).length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to save availability response");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
