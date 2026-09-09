// app/api/availability/[id]/remind/route.ts
// POST - manager only. A manual "Remind everyone" nudge. Goes through the same
//        `remindNonResponders` the cron uses, so it is cadence-gated: mashing
//        the button four times still sends one nudge per person.
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { remindNonResponders } from "@/lib/availability/remind";
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
    if (ctx.poll.status !== "open") {
      return NextResponse.json(
        { error: "This poll is not open" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const memberIds = Array.isArray(body?.memberIds)
      ? body.memberIds.map(String).filter(Boolean)
      : null;

    const report = await remindNonResponders(ctx.poll, {
      actorId: member._id,
      // A named person is a deliberate poke, so it skips the cadence gate the
      // "remind everyone" button respects. `maxReminders` still stops it.
      ...(memberIds && memberIds.length
        ? { onlyMemberIds: memberIds, ignoreCadence: true }
        : {}),
    });
    logger.info(
      { pollId: params.id, ...report, by: String(member._id) },
      "Manual availability reminder"
    );
    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to send availability reminders");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
