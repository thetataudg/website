// app/api/availability/[id]/route.ts
// GET    - the poll, plus who is on it and (for the viewer) their own grid.
// PATCH  - manager edits: title, description, deadline, reminder policy.
// DELETE - manager cancels the poll (soft: status -> "cancelled").
import { NextResponse } from "next/server";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { currentMember, loadPollContext } from "@/lib/availability/routeHelpers";
import { slugify } from "@/lib/availability/slug";
import {
  CHAPTER_SWATCH,
  swatchForId,
  swatchForKey,
} from "@/lib/calendarColors";

export const dynamic = "force-dynamic";

async function memberDirectory(ids: any[]) {
  const rows = await Member.find({ _id: { $in: ids } })
    .select("_id fName lName")
    .lean<any[]>();
  return rows.map((m) => ({
    _id: String(m._id),
    name: `${m.fName ?? ""} ${m.lName ?? ""}`.trim(),
  }));
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const member = await currentMember(req);
    const ctx = await loadPollContext(params.id, member);
    if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!ctx.isManager && !ctx.isInvitee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const me = member._id?.toString();
    const mine = (ctx.poll.responses || []).find(
      (r: any) => r.memberId?.toString() === me
    );

    // The shareable link: /member/<committee-slug>/poll/<poll-slug>. Chapter
    // -wide polls have no committee, so they share under "chapter".
    const committeeSlug = ctx.committee?.name
      ? slugify(ctx.committee.name)
      : "chapter";
    const sharePath =
      ctx.poll.slug &&
      `/member/${committeeSlug}/poll/${ctx.poll.slug}`;

    // The committee's calendar colour, so the grid reads as that committee's.
    const accentColor = ctx.committee
      ? (
          swatchForKey(ctx.committee.color) ??
          swatchForId(String(ctx.committee._id))
        ).light
      : CHAPTER_SWATCH.light;

    return NextResponse.json(
      {
        poll: ctx.poll,
        members: await memberDirectory(
          (ctx.poll.invitees || []).map((i: any) => i.memberId)
        ),
        viewer: {
          memberId: me,
          isManager: ctx.isManager,
          isInvitee: ctx.isInvitee,
        },
        myResponseSlots: mine?.slots ?? [],
        sharePath: sharePath || null,
        accentColor,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to load availability poll");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(
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
    if (ctx.poll.status === "scheduled") {
      return NextResponse.json(
        { error: "This poll is already scheduled" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const set: any = {};
    if (typeof body.title === "string" && body.title.trim()) {
      set.title = body.title.trim();
    }
    if (typeof body.description === "string") {
      set.description = body.description.trim();
    }
    if (body.deadline) {
      const d = new Date(body.deadline);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Bad deadline" }, { status: 400 });
      }
      set.deadline = d;
    }
    if (body.reminder && typeof body.reminder === "object") {
      const r = ctx.poll.reminder || {};
      set.reminder = {
        cadenceHours: Math.max(Number(body.reminder.cadenceHours ?? r.cadenceHours) || 24, 1),
        escalateToHead:
          body.reminder.escalateToHead ?? r.escalateToHead ?? true,
        finalCallHours: Math.max(Number(body.reminder.finalCallHours ?? r.finalCallHours) || 24, 1),
        maxReminders: Math.max(Number(body.reminder.maxReminders ?? r.maxReminders) || 5, 1),
      };
    }
    if (body.status === "open" && ctx.poll.status === "closed") {
      set.status = "open";
    }

    if (!Object.keys(set).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await AvailabilityPoll.findByIdAndUpdate(
      params.id,
      { $set: set },
      { new: true }
    ).lean();
    return NextResponse.json(updated, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update availability poll");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function DELETE(
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
    await AvailabilityPoll.updateOne(
      { _id: params.id },
      { $set: { status: "cancelled" } }
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to cancel availability poll");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
