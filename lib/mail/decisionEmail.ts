// lib/mail/decisionEmail.ts
//
// Tells a member what happened to their chapter email request. Sent to the
// personal address on their account, because on approval the new mailbox is
// the news and on denial there is no mailbox to send it to.
import logger from "@/lib/logger";
import { getClerkUser } from "@/lib/clerk";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import { EmailContent, renderEmailHtml, renderEmailText } from "@/lib/notify/emailTemplate";
import { sendEmail } from "@/lib/mail/resend";
import { recordSystemSend } from "@/lib/mail/budget";
import { siteUrl } from "@/lib/mail/site";

async function personalAddress(clerkId?: string | null): Promise<string | null> {
  if (!clerkId) return null;
  try {
    const user = await getClerkUser(clerkId);
    const primary = user.emailAddresses?.find((e: any) => e.id === user.primaryEmailAddressId);
    const address = primary?.emailAddress || user.emailAddresses?.[0]?.emailAddress;
    return address ? String(address).trim() : null;
  } catch (err) {
    logger.warn({ err, clerkId }, "Could not read member email from Clerk");
    return null;
  }
}

function contentFor(decision: "approved" | "rejected", firstName: string, address: string, comments: string): EmailContent {
  const greeting = firstName ? `${firstName}, ` : "";
  if (decision === "approved") {
    return {
      eyebrow: "Chapter Mail",
      title: "Your chapter email is ready",
      paragraphs: [
        `${greeting}your request was approved. Your new address is ${address}.`,
        "You can send and receive mail from it on the member site under More, Chapter Mail.",
      ].concat(comments ? [`A note from the officer who reviewed it: ${comments}`] : []),
      ctaLabel: "Open Chapter Mail",
      ctaHref: `${siteUrl()}/member/mail`,
      preheader: `Your address ${address} is ready to use.`,
    };
  }
  return {
    eyebrow: "Chapter Mail",
    title: "About your chapter email request",
    paragraphs: [
      `${greeting}your request for ${address} was not approved.`,
      comments
        ? `The officer who reviewed it left this: ${comments}`
        : "If you think this was a mistake, reply to this email and an officer will take another look.",
      "You can request a different address from Chapter Mail at any time.",
    ],
    ctaLabel: "Open Chapter Mail",
    ctaHref: `${siteUrl()}/member/mail`,
    preheader: "An update on your chapter email request.",
  };
}

/// Never throws. The decision is already recorded by the time this runs.
export async function sendMailDecisionEmail(args: {
  clerkId?: string | null;
  firstName?: string;
  decision: "approved" | "rejected";
  address: string;
  comments?: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const to = await personalAddress(args.clerkId);
  if (!to) return false;
  const content = contentFor(args.decision, String(args.firstName || "").trim(), args.address, String(args.comments || "").trim());
  const result = await sendEmail({
    from: fromAddressFor("auth"),
    to: [to],
    reply_to: [replyToFor("auth")],
    subject: args.decision === "approved" ? "Your chapter email is ready" : "An update on your chapter email request",
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  });
  if (!result.ok) {
    logger.warn({ status: result.status, error: result.error }, "Mail decision email was not sent");
    return false;
  }
  await recordSystemSend();
  return true;
}
