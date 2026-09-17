// lib/minutesNotify.ts
// Telling minutes@ttdg.org that a meeting's minutes are up.
//
// One email to the group, not one per member, so posting minutes costs a
// single send. Like the other announcements, nothing in here throws: the
// minutes are saved whether or not the email goes out.
//
// The email carries the minutes themselves rather than a pointer to them: the
// executive summary the scribe wrote, the meeting's facts, and the PDF
// attached. Most readers never needed to open the website, and the ones
// reading on a phone in a group inbox are the least likely to sign in.
import { DateTime } from "luxon";
import logger from "@/lib/logger";
import { ARIZONA_ZONE } from "@/lib/recurrence";
import { absoluteUrl } from "@/lib/siteUrl";
import { sendGroupEmail } from "@/lib/notify/groupEmail";
import type { EmailMetaRow } from "@/lib/notify/emailTemplate";

/// Resend refuses a message over 40 MB once encoded, and base64 grows a file
/// by a third. Anything bigger goes out without the attachment and the button
/// still leads to it.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface MinutesAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function announceMinutes(
  minute: any,
  options: { attachment?: MinutesAttachment; postedBy?: string } = {}
): Promise<void> {
  try {
    const start = minute?.startTime ? new Date(minute.startTime) : null;
    const end = minute?.endTime ? new Date(minute.endTime) : null;
    const startLocal = start ? DateTime.fromJSDate(start).setZone(ARIZONA_ZONE) : null;
    const endLocal = end ? DateTime.fromJSDate(end).setZone(ARIZONA_ZONE) : null;
    const when = startLocal ? startLocal.toFormat("EEEE, LLLL d") : "";
    const name = String(minute?.eventName || "").trim();
    const summary = String(minute?.executiveSummary || "").trim();

    // The scribe's own line breaks are the paragraphs.
    const summaryParagraphs = summary
      .split(/\n\s*\n|\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const meta: EmailMetaRow[] = [];
    if (when) meta.push({ label: "Date", value: when });
    if (startLocal && endLocal) {
      meta.push({
        label: "Time",
        value: `${startLocal.toFormat("h:mm a")} to ${endLocal.toFormat("h:mm a")}`,
      });
    }
    if (Number.isFinite(Number(minute?.activesPresent))) {
      meta.push({ label: "Actives present", value: String(minute.activesPresent) });
    }
    meta.push({ label: "Quorum required", value: minute?.quorumRequired ? "Yes" : "No" });
    if (options.postedBy) meta.push({ label: "Posted by", value: options.postedBy });

    const attachment =
      options.attachment && options.attachment.content.length <= MAX_ATTACHMENT_BYTES
        ? options.attachment
        : undefined;
    if (options.attachment && !attachment) {
      logger.warn(
        { minuteId: String(minute?._id || ""), bytes: options.attachment.content.length },
        "Minutes file too large to attach; sending without it"
      );
    }

    await sendGroupEmail({
      groups: ["minutes"],
      category: "general",
      subject: `Minutes posted: ${name || when || "chapter meeting"}`,
      content: {
        eyebrow: "Minutes",
        title: name ? `Minutes from ${name}` : when ? `Minutes from ${when}` : "New minutes",
        align: "center",
        paragraphs: summaryParagraphs.length
          ? summaryParagraphs
          : ["The minutes from this meeting are posted."],
        meta,
        metaBeforeCta: true,
        ctaLabel: attachment ? "Open on the website" : "Read the minutes",
        ctaHref: absoluteUrl(`/member/minutes/${encodeURIComponent(String(minute?.meetingDateKey || ""))}`),
        footnote: attachment ? "The full minutes are attached." : undefined,
        preheader: summary.slice(0, 140) || "The minutes from this meeting are posted.",
      },
      attachments: attachment
        ? [
            {
              filename: attachment.filename,
              content: attachment.content.toString("base64"),
              content_type: attachment.contentType || "application/pdf",
            },
          ]
        : undefined,
      idempotencyKey: `minutes/${String(minute?._id || "")}`,
    });
  } catch (err: any) {
    logger.warn({ err, minuteId: String(minute?._id || "") }, "Could not announce minutes");
  }
}
