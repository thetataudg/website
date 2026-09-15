// lib/membershipNotify.ts
// Tells the officers who approve access that there is something to approve.
//
// The Requests tab has carried a count badge for a while, but a badge only
// works on somebody already looking at the admin area. Nothing reached an
// officer who was not: a request could sit in the queue for days while the
// applicant waited on a decision nobody knew to make.
import { notifyQuietly } from "@/lib/notify";
import { officerRecipients } from "@/lib/notify/audience";
import { officerTemplateFor } from "@/lib/notify/templates";
import logger from "@/lib/logger";

/// Push and the in-app feed, no email.
///
/// The same rule chapter mail follows: every email counts against the shared
/// daily budget, and this audience is every officer and admin at once. During
/// recruitment a single evening of sign-ups would spend a large slice of the
/// allowance telling fifteen people the same thing. The in-app row is written
/// regardless of what is listed here, so the bell and the Requests badge stay
/// correct even where push is not set up.
const OFFICER_CHANNELS = ["push"];

/**
 * Announce a new access request to the officers who can act on it.
 *
 * Never throws. The request is already saved by the time this runs, and an
 * applicant must not see their submission fail because a push did not land.
 */
export async function notifyOfficersOfAccessRequest(args: {
  firstName?: string;
  lastName?: string;
  rollNo?: string;
}): Promise<{ notified: number }> {
  const name =
    `${args.firstName ?? ""} ${args.lastName ?? ""}`.trim() || "Someone";
  const roll = String(args.rollNo ?? "").trim();
  // The roll number is what an officer checks the request against, so it goes
  // in the body where there is room for it, not the push where it would push
  // the name out.
  const body = roll
    ? `${name} asked for member access and listed roll #${roll}.`
    : `${name} asked for member access.`;

  let officers;
  try {
    officers = await officerRecipients();
  } catch (err) {
    logger.warn({ err }, "Could not resolve officers for a new access request");
    return { notified: 0 };
  }

  await Promise.all(
    officers.map((recipient) =>
      notifyQuietly({
        recipient,
        template: officerTemplateFor("access_requested"),
        context: { firstName: recipient.firstName, amountCents: 0 },
        message: {
          title: "New access request",
          body,
          // Under 120 characters even with a long name: iOS truncates, and a
          // notice that ends mid-name tells an officer nothing.
          push: `${name} is waiting for member access.`,
          emailSubject: `New access request: ${name}`,
          // CTA_BY_PATH already maps this to "Open the pending list".
          link: "/member/admin/pending",
          category: "general",
        },
        amountCents: null,
        channels: OFFICER_CHANNELS,
        // Nothing here touches anybody's ledger, so nothing belongs on a
        // financial timeline.
        audit: false,
      })
    )
  );

  logger.info(
    { event: "Officers notified of access request", officers: officers.length, rollNo: roll },
    "Access request announced"
  );
  return { notified: officers.length };
}
