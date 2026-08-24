// app/api/dues/reminders/route.ts
// The treasurer pressing "remind them".
//
// Shares every line of its path with the nightly cron: same selector, same
// exclusions, same cooldown, same records. The only difference is that this one
// carries an actor and can be told to ignore the calendar.
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireTreasury } from "@/lib/duesAuth";
import { selectReminderCandidates, phoenixDayLabel } from "@/lib/notify/selector";
import { ensureMemberEmails } from "@/lib/notify/emails";
import { notifyMany } from "@/lib/notify";
import { isReminderTemplate, ReminderTemplate } from "@/lib/notify/templates";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));

    const memberIds = Array.isArray(body?.memberIds)
      ? body.memberIds.filter((id: any) => mongoose.Types.ObjectId.isValid(String(id)))
      : [];

    const selection = await selectReminderCandidates({
      // A manual send chases everyone who owes, whatever today's date is. It
      // still can't bypass the exclusions or the cooldown — those hold for an
      // impatient officer exactly as they hold for the cron.
      force: body?.force !== false,
      memberIds: memberIds.length ? memberIds : undefined,
      term: body?.term || undefined,
    });

    if (!selection.candidates.length) {
      return NextResponse.json(
        {
          sentCount: 0,
          skippedCount: selection.skipped.length,
          summary:
            selection.skipped.length > 0
              ? `Nobody needed reminding. ${selection.skipped.length} are already waiting on you or up to date.`
              : "Nobody owes anything right now.",
          channels: [],
          recipients: [],
          skipped: selection.skipped,
        },
        { status: 200 }
      );
    }

    await ensureMemberEmails(
      selection.candidates.map((candidate) => candidate.recipient.memberId)
    );

    // An officer may override what gets said and where it goes. Both are
    // optional: left alone, a hand-sent reminder is byte-for-byte the one the
    // cron would have sent, which is the point of sharing this path.
    const chosenTemplate =
      typeof body?.template === "string" && isReminderTemplate(body.template)
        ? (body.template as ReminderTemplate)
        : null;
    const customMessage = String(body?.message || "").trim();
    const channels = Array.isArray(body?.channels)
      ? body.channels.filter((name: any) => typeof name === "string")
      : undefined;

    const report = await notifyMany(
      selection.candidates.map((candidate) => ({
        recipient: candidate.recipient,
        template: chosenTemplate ?? candidate.template,
        context: {
          firstName: candidate.recipient.firstName,
          amountCents: candidate.amountCents,
          dueLabel: phoenixDayLabel(candidate.dueDate),
          daysOverdue: candidate.daysOverdue,
          description: candidate.description,
          installmentSeq: candidate.installmentSeq,
          installmentCount: candidate.installmentCount,
        },
        amountCents: candidate.amountCents,
        refs: candidate.refs,
        sentBy: viewer._id,
        channels,
        // Only the lines a person actually wrote are overridden. The subject,
        // link and category still come from the template.
        override: customMessage
          ? { body: customMessage, push: customMessage.slice(0, 120) }
          : undefined,
      }))
    );

    logger.info(
      { actor: viewer.rollNo, sent: report.sentCount, skipped: report.skippedCount },
      "Dues reminders sent by hand"
    );
    return NextResponse.json({ ...report, skipped: selection.skipped }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to send dues reminders");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// A dry run: who would be reminded, and who wouldn't, without sending
/// anything. The confirm dialog reads this so the treasurer sees the number
/// before the notifications go out rather than after.
export async function GET(req: Request) {
  try {
    await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const selection = await selectReminderCandidates({
      force: searchParams.get("force") !== "0",
      term: searchParams.get("term") || undefined,
    });

    const { membersInCooldown } = await import("@/lib/notify");
    const byTemplate = new Map<string, any[]>();
    for (const candidate of selection.candidates) {
      const list = byTemplate.get(candidate.template) ?? [];
      list.push(candidate);
      byTemplate.set(candidate.template, list);
    }

    let cooldownCount = 0;
    const willSend: any[] = [];
    for (const [template, candidates] of byTemplate) {
      const cooling = await membersInCooldown(
        candidates.map((candidate) => candidate.recipient.memberId),
        template as any
      );
      for (const candidate of candidates) {
        if (cooling.has(String(candidate.recipient.memberId))) {
          cooldownCount += 1;
          continue;
        }
        willSend.push({
          rollNo: candidate.recipient.rollNo,
          name: `${candidate.recipient.firstName} ${candidate.recipient.lastName}`.trim(),
          template: candidate.template,
          amountCents: candidate.amountCents,
        });
      }
    }

    return NextResponse.json(
      {
        wouldSendCount: willSend.length,
        cooldownCount,
        excludedCount: selection.skipped.length,
        willSend,
        skipped: selection.skipped,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error({ err }, "Failed to preview dues reminders");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
