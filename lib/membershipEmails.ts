// lib/membershipEmails.ts
//
// The two emails an applicant gets about their access request: one when it
// lands in the queue, one when it is decided.
//
// Until now a decision was silent: the request simply changed state, and the
// applicant found out only if they happened to reopen the app. Approval in
// particular is news somebody is waiting on.
//
// The queued email closes the other end of the same gap. Submitting the
// onboarding form showed a modal and then nothing ever again, so an applicant
// who closed the tab had no evidence they had applied at all.

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

/// Shared by both sends. `skipped` is a reason, not an error: a missing
/// address or an unconfigured Resend is something a caller reports, never
/// something that undoes the request the email was describing.
export type MembershipEmailResult =
  | { sent: true }
  | { sent: false; skipped: string };

/// The old name, kept so the decision route's call site reads unchanged.
export type DecisionEmailResult = MembershipEmailResult;

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

  return deliver({
    to,
    subject:
      args.decision === "approved"
        ? "Your Theta Tau membership is approved"
        : "An update on your Theta Tau access request",
    content,
    kind: `decision:${args.decision}`,
    clerkId: args.clerkId,
  });
}

/**
 * Tell an applicant their request is in the queue.
 *
 * Sent the moment the onboarding form is accepted, so the only acknowledgement
 * is no longer a modal the applicant can close and never see again. It names
 * the two things somebody in a queue actually wants to know: that it arrived,
 * and that nothing further is expected of them.
 *
 * Never throws, for the same reason the decision email does not: the request
 * row is already written by the time this runs, and a mail failure must not
 * turn a successful submission into an error.
 */
export async function sendAccessRequestQueuedEmail(args: {
  clerkId?: string;
  firstName?: string;
}): Promise<MembershipEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, skipped: "resend not configured" };
  }
  if (!args.clerkId) {
    return { sent: false, skipped: "no clerk account on the request" };
  }

  const to = await addressFor(args.clerkId);
  if (!to) return { sent: false, skipped: "no email address" };

  const firstName = String(args.firstName || "").trim();
  const greeting = firstName ? `${firstName}, ` : "";

  return deliver({
    to,
    subject: "We have your Theta Tau access request",
    content: {
      eyebrow: "Membership",
      title: "Request received",
      paragraphs: [
        `${greeting}your access request is in the queue. An officer reviews these by hand, so it will not be instant, and you will get an email either way once somebody has looked at it.`,
        // Said plainly because the most common thing an applicant does while
        // waiting is submit again, assuming the first one failed.
        "There is nothing else for you to do right now.",
      ],
      ctaLabel: "Check your request",
      ctaHref: `${siteUrl()}/member`,
      footnote:
        "If something on the form was wrong, reply to this message and an officer can fix it before they review.",
      preheader: "Your Theta Tau access request is waiting for an officer to review.",
    },
    kind: "queued",
    clerkId: args.clerkId,
  });
}

/**
 * The one place either email actually goes out.
 *
 * Shared so the two messages cannot drift on sender, reply-to, or whether the
 * send is counted against the daily budget — the last of which is easy to
 * forget in a copy and silently over-spends the chapter's mail allowance.
 */
async function deliver(args: {
  to: string;
  subject: string;
  content: EmailContent;
  /// Log label only, so a failure says which of the two messages it was.
  kind: string;
  clerkId: string;
}): Promise<MembershipEmailResult> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddressFor("auth"),
        to: [args.to],
        reply_to: replyToFor("auth"),
        subject: args.subject,
        html: renderEmailHtml(args.content),
        text: renderEmailText(args.content),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, detail: detail.slice(0, 300), kind: args.kind },
        "Resend rejected a membership email"
      );
      return { sent: false, skipped: `resend ${res.status}` };
    }

    await recordSystemSend();
    logger.info({ kind: args.kind, clerkId: args.clerkId }, "Membership email sent");
    return { sent: true };
  } catch (err) {
    logger.warn({ err, kind: args.kind }, "Failed to send a membership email");
    return { sent: false, skipped: "send failed" };
  }
}
