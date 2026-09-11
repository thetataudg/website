// lib/membershipDecisionEmail.ts
//
// Tells an applicant what happened to their access request.
//
// Until now a decision was silent: the request simply changed state, and the
// applicant found out only if they happened to reopen the app. Approval in
// particular is news somebody is waiting on.

import logger from "@/lib/logger";
import { getClerkUser } from "@/lib/clerk";
import { recordSystemSend } from "@/lib/mail/budget";
import { fromAddressFor, replyToFor } from "@/lib/notify/from";
import {
  EmailContent,
  renderEmailHtml,
  renderEmailText,
} from "@/lib/notify/emailTemplate";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type MembershipDecision = "approved" | "rejected";

export type DecisionEmailResult =
  | { sent: true }
  | { sent: false; skipped: string };

function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (configured || "https://ttdg.org").replace(/\/$/, "");
}

/// The applicant's own address, from Clerk.
///
/// A pending member has no `Member` row yet, so there is no cached email to
/// read — Clerk is the only place the address exists at this point.
async function addressFor(clerkId: string): Promise<string | null> {
  try {
    const user = await getClerkUser(clerkId);
    const primary = user.emailAddresses?.find(
      (e: any) => e.id === user.primaryEmailAddressId
    );
    const address = primary?.emailAddress || user.emailAddresses?.[0]?.emailAddress;
    return address ? String(address).trim() : null;
  } catch (err) {
    logger.warn({ err, clerkId }, "Could not read applicant email from Clerk");
    return null;
  }
}

function contentFor(
  decision: MembershipDecision,
  firstName: string,
  comments: string,
  status?: string
): EmailContent {
  const greeting = firstName ? `${firstName}, ` : "";

  if (decision === "approved") {
    // Alumni don't pay dues or vote, and what they mostly came for is the
    // minutes and newsletters, which start arriving on the next group sync.
    const whatOpens =
      status === "Alumni"
        ? `Welcome back. You'll now get chapter meeting minutes and newsletters by email, and you can see alumni events and the brother directory. More at ${siteUrl()}/alumni/stay-connected.`
        : "Everything opens up from here: the calendar, check-in, dues, voting and the brother directory.";
    return {
      eyebrow: "Membership",
      title: "You're in",
      paragraphs: [
        `${greeting}your access request has been approved. Your profile is live on the chapter roster, and you can sign in on the app or the website now.`,
        whatOpens,
      ].concat(comments ? [`A note from the officer who reviewed it: ${comments}`] : []),
      ctaLabel: "Open the member portal",
      ctaHref: `${siteUrl()}/member`,
      footnote: "If anything on your profile is wrong, you can edit it yourself under My Profile.",
      preheader: "Your Theta Tau access request has been approved.",
    };
  }

  return {
    eyebrow: "Membership",
    title: "About your access request",
    paragraphs: [
      `${greeting}your access request was not approved.`,
      // The comment is the whole value of a rejection email. Without it the
      // message says nothing the applicant can act on.
      comments
        ? `The officer who reviewed it left this: ${comments}`
        : "No reason was given. If you think this was a mistake, reply to this email and an officer will take another look.",
    ],
    footnote: "If you believe this was a mistake, reply to this message and it will reach an officer.",
    preheader: "An update on your Theta Tau access request.",
  };
}

/**
 * Send the decision. Never throws.
 *
 * A decision that could not be emailed is a follow-up for a human, not a
 * reason to fail the request that recorded it — the approval itself has
 * already happened by the time this runs.
 */
export async function sendMembershipDecisionEmail(args: {
  clerkId?: string;
  firstName?: string;
  decision: MembershipDecision;
  comments?: string;
  /// The member status approval assigned. "Alumni" gets its own copy.
  status?: string;
}): Promise<DecisionEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, skipped: "resend not configured" };
  }
  if (!args.clerkId) {
    return { sent: false, skipped: "no clerk account on the request" };
  }

  const to = await addressFor(args.clerkId);
  if (!to) return { sent: false, skipped: "no email address" };

  const content = contentFor(
    args.decision,
    String(args.firstName || "").trim(),
    String(args.comments || "").trim(),
    args.status
  );

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddressFor("auth"),
        to: [to],
        reply_to: replyToFor("auth"),
        subject:
          args.decision === "approved"
            ? "Your Theta Tau membership is approved"
            : "An update on your Theta Tau access request",
        html: renderEmailHtml(content),
        text: renderEmailText(content),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, detail: detail.slice(0, 300), decision: args.decision },
        "Resend rejected a membership decision email"
      );
      return { sent: false, skipped: `resend ${res.status}` };
    }

    await recordSystemSend();
    logger.info({ decision: args.decision, clerkId: args.clerkId }, "Membership decision emailed");
    return { sent: true };
  } catch (err) {
    logger.warn({ err, decision: args.decision }, "Failed to send membership decision email");
    return { sent: false, skipped: "send failed" };
  }
}
