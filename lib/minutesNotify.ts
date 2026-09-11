// lib/minutesNotify.ts
// Telling minutes@ttdg.org that a meeting's minutes are up.
//
// One email to the group, not one per member, so posting minutes costs a
// single send. Like the other announcements, nothing in here throws: the
// minutes are saved whether or not the email goes out.
import { DateTime } from "luxon";
import logger from "@/lib/logger";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { absoluteUrl } from "@/lib/siteUrl";
import { sendGroupEmail } from "@/lib/notify/groupEmail";

export async function announceMinutes(minute: any): Promise<void> {
  try {
    const start = minute?.startTime ? new Date(minute.startTime) : null;
    const when = start
      ? DateTime.fromJSDate(start).setZone(ARIZONA_ZONE).toFormat("EEEE, LLLL d")
      : "";
    const name = String(minute?.eventName || "").trim();
    const label = name || (when ? `the ${when} meeting` : "the last meeting");
    const summary = String(minute?.executiveSummary || "").trim();

    await sendGroupEmail({
      groups: ["minutes"],
      category: "general",
      subject: `Minutes posted: ${name || when || "chapter meeting"}`,
      content: {
        eyebrow: "Minutes",
        title: name ? `Minutes from ${name}` : when ? `Minutes from ${when}` : "New minutes",
        align: "left",
        paragraphs: [`The minutes from ${label} are posted.`, summary].filter(Boolean),
        ctaLabel: "Read the minutes",
        ctaHref: absoluteUrl(`/member/minutes/${encodeURIComponent(String(minute?.meetingDateKey || ""))}`),
        preheader: summary.slice(0, 140) || `The minutes from ${label} are posted.`,
      },
      idempotencyKey: `minutes/${String(minute?._id || "")}`,
    });
  } catch (err: any) {
    logger.warn({ err, minuteId: String(minute?._id || "") }, "Could not announce minutes");
  }
}
