// lib/notify/channels/email.ts
// Resend, over its REST API.
//
// Called directly with `fetch` rather than through the `resend` package: the
// send endpoint is one POST with a JSON body, and adding a dependency to wrap
// it would buy nothing but a version to keep up with. The moment RESEND_API_KEY
// and DUES_EMAIL_FROM are set, this starts working with no other change.
import logger from "@/lib/logger";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import {
  EmailContent,
  EmailMetaRow,
  renderEmailHtml,
  renderEmailText,
} from "@/lib/notify/emailTemplate";
import { ctaLabelFor } from "@/lib/notify/templates";
import { formatCents } from "@/lib/financeEvents";
import type { Channel, DeliveryRequest, DeliveryResult } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/// The codebase is split between two names for this and only one of them is
/// actually set, so both are read. Getting it wrong doesn't error — it silently
/// points every link in every email at the wrong host, which is the kind of bug
/// you discover from a member asking why the button did nothing.
function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (configured || "https://thetatau-dg.org").replace(/\/$/, "");
}

/// Turns a rendered message into the shape the layout wants.
///
/// The hero number is the whole reason these emails work: a member scanning
/// their phone should get the amount and the deadline without reading a
/// sentence. Transactional confirmations deliberately skip it — "your payment
/// was verified" is news, not a bill, and putting a big number on it makes a
/// receipt look like a demand.
function contentFor(request: DeliveryRequest): EmailContent {
  const { message, recipient, template, amountCents } = request;
  const amount = amountCents ? formatCents(amountCents) : null;
  const isBill = ["assigned", "upcoming", "due_soon", "due_today", "overdue", "installment_due"]
    .includes(template);

  const meta: EmailMetaRow[] = [];
  if (template === "payment_verified" && amount) {
    meta.push({ label: "Amount confirmed", value: amount, tone: "positive" });
  }
  if (template === "credit_paid_out" && amount) {
    meta.push({ label: "Paid to you", value: amount, tone: "positive" });
  }

  return {
    title: message.title,
    heroAmount: isBill && amount ? amount : undefined,
    heroLabel: isBill ? (template === "installment_due" ? "Instalment due" : "Amount due") : undefined,
    paragraphs: [`Hey ${recipient.firstName},`, message.body],
    meta: meta.length ? meta : undefined,
    // Derived from the destination rather than written here. A literal label
    // meant every email the chapter sent carried a button reading "Open your
    // dues", including the ones about votes and reimbursements.
    ctaLabel: ctaLabelFor(message),
    ctaHref: `${siteUrl()}${message.link || "/member/dues"}`,
    footnote: "Reply to this email if you need anything clarified.",
    replyTo: replyToFor(message.category),
    preheader: message.push,
  };
}

export const emailChannel: Channel = {
  name: "email",

  isConfigured() {
    // The sending domain has a sane default; the key is the thing that has to
    // be supplied, and without it this channel stays silently inert.
    return Boolean(process.env.RESEND_API_KEY);
  },

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return { channel: "email", delivered: false, skipped: "not configured" };
    }
    const to = request.recipient.email;
    if (!to) {
      // Real state, not an error: someone who has never signed in has no
      // address for us to cache.
      return { channel: "email", delivered: false, skipped: "no email on file" };
    }

    const content = contentFor(request);
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Chosen per message: dues notices come from dues@, so a member's
          // inbox groups the whole conversation about their money together.
          from: fromAddressFor(request.message.category),
          to: [to],
          // The From mailbox can't receive; this is where a reply actually goes.
          reply_to: replyToFor(request.message.category),
          subject: request.message.emailSubject,
          html: renderEmailHtml(content),
          // A message with no text part is a well-known spam signal, quite
          // apart from being unreadable to anyone whose client refuses HTML.
          text: renderEmailText(content),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logger.warn(
          { status: res.status, detail: detail.slice(0, 300), rollNo: request.recipient.rollNo },
          "Resend rejected a dues email"
        );
        return { channel: "email", delivered: false, skipped: `resend ${res.status}` };
      }
      return { channel: "email", delivered: true };
    } catch (err: any) {
      logger.warn({ err, rollNo: request.recipient.rollNo }, "Dues email failed to send");
      return { channel: "email", delivered: false, skipped: "network error" };
    }
  },
};
