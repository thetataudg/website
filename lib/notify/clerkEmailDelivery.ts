import { findClerkEmailTemplate, renderClerkEmail } from "./clerkEmailTemplates";
import { fromAddressFor, replyToFor } from "./from";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ClerkEmailPayload = {
  id: string;
  slug: string;
  to: string;
  subject?: string | null;
  body?: string | null;
  bodyPlain?: string | null;
  data?: Record<string, unknown> | null;
};

export type ClerkEmailSendResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: string };

export async function sendClerkEmail(
  payload: ClerkEmailPayload
): Promise<ClerkEmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "Resend is not configured" };

  const template = findClerkEmailTemplate(payload.slug);
  const rendered = template
    ? renderClerkEmail(template, payload.data ?? {})
    : {
        subject: payload.subject || "Theta Tau account notification",
        html: payload.body || "",
        text: payload.bodyPlain || "",
      };

  if (!rendered.html && !rendered.text) {
    return { sent: false, reason: `No content for Clerk template ${payload.slug}` };
  }

  const category = payload.slug === "invitation" ? "invitation" : "auth";
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `clerk-email-${payload.id}`,
      },
      body: JSON.stringify({
        from: fromAddressFor(category),
        to: [payload.to],
        reply_to: replyToFor(category),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      return {
        sent: false,
        reason: `Resend ${response.status}: ${responseBody.slice(0, 300)}`,
      };
    }

    let messageId: string | null = null;
    try {
      messageId = JSON.parse(responseBody)?.id ?? null;
    } catch {}
    return { sent: true, messageId };
  } catch {
    return { sent: false, reason: "Resend request failed" };
  }
}
