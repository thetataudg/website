// lib/notify/inviteEmail.ts
//
// Sends the chapter's own invitation email through Resend.
//
// Clerk will happily mail the invitation itself, but restyling that message is
// a paid Clerk feature (`app:custom_email_template`, 402 on this plan), so its
// invitations arrive in Clerk's stock black-and-white while every other email
// the chapter sends is branded. Creating the invitation with `notify: false`
// and mailing the ticket URL ourselves sidesteps that entirely: same link, same
// layout as the dues and event mail.
//
// Falls back silently to letting Clerk send when Resend is not configured — see
// `invitationEmailConfigured`, which the invite route checks before deciding
// which side sends.
import logger from "@/lib/logger";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import { renderEmailHtml, renderEmailText } from "@/lib/notify/emailTemplate";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CATEGORY = "invitation";

/// Whether we are in a position to send the invitation ourselves. When false
/// the caller should let Clerk mail it, because an invitation nobody receives
/// is worse than an unbranded one.
export function invitationEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/// The rendered invitation, separated from sending so it can be previewed and
/// asserted on without mailing anyone.
export function invitationEmailContent(params: {
  acceptUrl: string;
  expiresInDays?: number;
}) {
  const { acceptUrl, expiresInDays = 30 } = params;
  return {
    title: "You're invited to join Theta Tau",
    preheader: `Set up your chapter account. This link expires in ${expiresInDays} days.`,
    paragraphs: [
      "You have been invited to create an account for Theta Tau, Delta Gamma at Arizona State University.",
      "The button below sets up your account and takes you straight to the member tools: dues, minutes, events, the roster, and chapter voting.",
    ],
    ctaLabel: "Accept invitation",
    ctaHref: acceptUrl,
    footnote: `This invitation expires in ${expiresInDays} days and can only be used once. If you were not expecting it, you can ignore this email.`,
    replyTo: replyToFor(CATEGORY),
  };
}

export type InviteEmailResult =
  | { sent: true }
  | { sent: false; reason: string };

export async function sendInvitationEmail(params: {
  /// Where the invitation is going.
  email: string;
  /// Clerk's ticket URL, taken from the created invitation's `url`.
  acceptUrl: string;
  /// Clerk's default is 30; only used for the wording.
  expiresInDays?: number;
}): Promise<InviteEmailResult> {
  const { email, acceptUrl, expiresInDays = 30 } = params;

  if (!invitationEmailConfigured()) {
    return { sent: false, reason: "resend not configured" };
  }

  const content = invitationEmailContent({ acceptUrl, expiresInDays });

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddressFor(CATEGORY),
        to: [email],
        // The sending mailbox cannot receive, so a reply needs somewhere real
        // to land — and an invitation is exactly the moment someone has a
        // question they want a human to answer.
        reply_to: replyToFor(CATEGORY),
        subject: "You're invited to join Theta Tau, Delta Gamma",
        html: renderEmailHtml(content),
        // A message with no text part is a well-known spam signal, and this one
        // is already fighting a cold sending domain.
        text: renderEmailText(content),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, detail: detail.slice(0, 300), email },
        "Resend rejected an invitation email"
      );
      return { sent: false, reason: `resend ${res.status}` };
    }

    logger.info({ email }, "Invitation email sent through Resend");
    return { sent: true };
  } catch (err: any) {
    logger.warn({ err, email }, "Invitation email failed to send");
    return { sent: false, reason: "network error" };
  }
}
