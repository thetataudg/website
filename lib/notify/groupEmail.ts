// lib/notify/groupEmail.ts
// One email to a chapter Google Group instead of one per member.
//
// Resend bills every send against the daily budget, and a chapter-wide notice
// sent member by member spent the whole of it on a single event. Addressed to
// the group, it costs one send and Google does the fan-out. The groups must
// allow the alerts.ttdg.org senders to post, or Google holds the message.
//
// Nothing here is personalised: the group is the recipient, so there is no
// "Hey Vinny" line and no per-member amount. Anything that needs either still
// goes through `notify()`.
import logger from "@/lib/logger";
import { sendEmail, resendConfigured } from "@/lib/mail/resend";
import { recordSystemSend } from "@/lib/mail/budget";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import {
  EmailContent,
  renderEmailHtml,
  renderEmailText,
} from "@/lib/notify/emailTemplate";

export type ChapterGroup = "actives" | "alumni" | "newsletter" | "minutes";

/// Overridable so a staging deploy can point the groups at a test list.
const GROUP_ENV: Record<ChapterGroup, string> = {
  actives: "GROUP_EMAIL_ACTIVES",
  alumni: "GROUP_EMAIL_ALUMNI",
  newsletter: "GROUP_EMAIL_NEWSLETTER",
  minutes: "GROUP_EMAIL_MINUTES",
};

export function groupAddress(group: ChapterGroup): string {
  return process.env[GROUP_ENV[group]]?.trim() || `${group}@ttdg.org`;
}

export interface GroupEmailInput {
  groups: ChapterGroup[];
  /// Picks the From and Reply-To, as for every other chapter email.
  category: string;
  subject: string;
  content: EmailContent;
  /// Resend drops a repeat with the same key, so a retried request can't
  /// mail the group twice.
  idempotencyKey?: string;
}

/// Sends one message to every listed group. Never throws.
export async function sendGroupEmail(input: GroupEmailInput): Promise<boolean> {
  if (!input.groups.length || !resendConfigured()) return false;
  const to = Array.from(new Set(input.groups.map(groupAddress)));
  try {
    const result = await sendEmail(
      {
        from: fromAddressFor(input.category),
        to,
        reply_to: [replyToFor(input.category)],
        subject: input.subject,
        html: renderEmailHtml(input.content),
        text: renderEmailText(input.content),
      },
      input.idempotencyKey
    );
    if (!result.ok) {
      logger.warn({ to, status: result.status, error: result.error }, "Group email was rejected");
      return false;
    }
    await recordSystemSend();
    logger.info({ to, subject: input.subject }, "Group email sent");
    return true;
  } catch (err: any) {
    logger.warn({ err, to }, "Group email failed");
    return false;
  }
}
