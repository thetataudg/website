// lib/donationReceipt.ts
// Saying thank you to somebody who gave the chapter money.
//
// Deliberately outside `lib/notify`. That system is built around a Member: it
// resolves a recipient, honours cooldowns, writes a Notification row, and
// fans out to push and in-app as well as email. None of that fits a donor. Most
// people who give are alumni or friends with no account, no roll number and no
// device token, and the only thing we hold is the address they typed into a
// form. Forcing them through the member pipeline would mean inventing a fake
// recipient, and every guard in that pipeline would then be lying.
//
// So this sends one email, to one address, through the same Resend endpoint and
// the same rendered layout, and records that it did.
import Donation, { DONATION_DESIGNATION_LABELS } from "@/lib/models/Donation";
import { formatCents } from "@/lib/financeEvents";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import {
  EmailContent,
  renderEmailHtml,
  renderEmailText,
} from "@/lib/notify/emailTemplate";
import { siteUrl } from "@/lib/siteUrl";
import logger from "@/lib/logger";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ThankYouResult {
  sent: boolean;
  skipped?: string;
}

/// Why this gift should not be thanked right now, or null to go ahead.
///
/// Split out from the send so the decision can be tested without a network.
/// Every branch here is a real state somebody hits: giving an email address is
/// optional, webhooks redeliver, and a gift that has not settled must never be
/// thanked in case it later fails.
export function thankYouSkipReason(
  donation: any,
  options: { force?: boolean; configured: boolean }
): string | null {
  if (!donation) return "no donation";
  if (!options.configured) return "email is not configured";
  if (!String(donation.donorEmail || "").trim()) return "no email address";
  if (donation.status !== "succeeded") return "not settled";
  if (donation.receiptSentAt && !options.force) return "already thanked";
  return null;
}

/// The donor's first name, when we can work one out.
///
/// Falls back to no greeting at all rather than "Hey there": a thank-you that
/// opens by admitting it does not know who you are is worse than one that just
/// starts talking.
function greetingFor(donation: any): string | null {
  const raw = String(donation?.donorName || "").trim();
  if (!raw) return null;
  const first = raw.split(/\s+/)[0];
  return first.length > 1 ? first : null;
}

function contentFor(donation: any): EmailContent {
  const greeting = greetingFor(donation);
  const amount = formatCents(Number(donation.amountCents) || 0);
  const fund =
    DONATION_DESIGNATION_LABELS[String(donation.designation)] ??
    "Where it's needed most";
  const unrestricted = String(donation.designation) === "general";

  const paragraphs = [
    ...(greeting ? [`Hey ${greeting},`] : []),
    `Thank you for giving ${amount} to Theta Tau Delta Gamma.`,
    unrestricted
      ? "You left it unrestricted, so it goes wherever the gap is this semester. That is genuinely the most useful way to give."
      : `You pointed it at ${fund.toLowerCase()}, and that is where it goes.`,
    "Stripe has emailed you a separate receipt with the payment details.",
  ];

  return {
    eyebrow: "Theta Tau Delta Gamma",
    title: "Thank you",
    align: "left",
    paragraphs,
    meta: [
      { label: "Your gift", value: amount, tone: "positive" },
      { label: "Goes to", value: fund },
    ],
    ctaLabel: "See what the chapter does",
    ctaHref: `${siteUrl()}/about`,
    // The one line that has to be here. The chapter is not a registered
    // charity, and a thank-you letter is exactly the document somebody would
    // later hand an accountant.
    footnote:
      "Gifts to Theta Tau Delta Gamma support chapter operations. The chapter is not a registered charitable organization, so this gift is not tax deductible.",
    replyTo: replyToFor("donation"),
    preheader: `Your ${amount} gift to Theta Tau Delta Gamma.`,
  };
}

/// Send the thank-you, at most once per gift.
///
/// Never throws. A settled donation that could not be thanked is a follow-up
/// for a human, not a reason to fail the webhook that recorded the money.
export async function sendDonationThankYou(
  donation: any,
  options: { force?: boolean } = {}
): Promise<ThankYouResult> {
  const skipped = thankYouSkipReason(donation, {
    force: options.force,
    configured: Boolean(process.env.RESEND_API_KEY),
  });
  if (skipped) return { sent: false, skipped };
  const to = String(donation.donorEmail).trim();

  const content = contentFor(donation);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddressFor("donation"),
        to: [to],
        reply_to: replyToFor("donation"),
        subject: `Thank you for supporting Theta Tau Delta Gamma`,
        html: renderEmailHtml(content),
        text: renderEmailText(content),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        {
          status: res.status,
          detail: detail.slice(0, 300),
          donationId: String(donation._id),
        },
        "Resend rejected a donation thank-you"
      );
      return { sent: false, skipped: `resend ${res.status}` };
    }

    // Stamped through the model rather than on the document the caller handed
    // us, so this is safe whether it arrived lean or hydrated.
    await Donation.findByIdAndUpdate(donation._id, {
      receiptSentAt: new Date(),
    });
    logger.info(
      { donationId: String(donation._id) },
      "Donation thank-you sent"
    );
    return { sent: true };
  } catch (err: any) {
    logger.warn(
      { err, donationId: String(donation._id) },
      "Donation thank-you failed to send"
    );
    return { sent: false, skipped: "network error" };
  }
}
