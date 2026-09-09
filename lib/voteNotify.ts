// lib/voteNotify.ts
// Telling the chapter a vote is open.
//
// Modelled on `lib/eventNotify.ts` and bound by the same rule: announcing is a
// courtesy laid on top of a record that already exists. The vote is open the
// moment the document says so, so nothing in here throws and nothing in here
// can fail the request that opened it.
//
// One moment only. A vote that has *ended* is not something anybody can act on,
// and the results screen is already where an interested member goes looking.
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { notifyMany } from "@/lib/notify";
import { chapterRecipients } from "@/lib/notify/audience";
import type { TemplateContext } from "@/lib/notify/templates";

/// What to call this vote on a lock screen.
///
/// Deliberately never the pledge's or rushee's name, even though the vote
/// document holds them. A push is read by whoever is looking at the phone, and
/// a pledge vote announced by name is a private deliberation printed in a room
/// that may contain the pledge.
export function voteLabel(vote: any): string {
  const title = String(vote?.title || "").trim();
  if (title) return title;
  switch (String(vote?.type || "")) {
    case "Pledge":  return "A pledge vote";
    case "Bidding": return "A bid vote";
    case "Election": return "An election";
    default: return "A vote";
  }
}

/// A vote just opened. Tell every active member who can cast a ballot.
///
/// `chapterRecipients` is the right audience rather than a vote-specific one:
/// eligibility to vote is active membership, and it already filters out the
/// placeholder profiles that have no account behind them to notify.
export async function announceVoteOpened(
  vote: any,
  actorId: any | null = null
): Promise<number> {
  try {
    const recipients = await chapterRecipients();
    if (!recipients.length) {
      logger.warn({ voteId: String(vote?._id) }, "No recipients for vote announcement");
      return 0;
    }

    // The officer who opened it does not need a push telling them they opened
    // it. They are looking at the screen that did it.
    const actorRollNo = actorId
      ? String(
          (await Member.findById(actorId).select("rollNo").lean<any>())?.rollNo ?? ""
        )
      : "";
    const audience = actorRollNo
      ? recipients.filter((recipient) => recipient.rollNo !== actorRollNo)
      : recipients;

    const context: Partial<TemplateContext> = {
      voteTitle: voteLabel(vote),
      voteId: String(vote?._id || ""),
    };

    const report = await notifyMany(
      audience.map((recipient) => ({
        recipient,
        template: "vote_opened" as const,
        context: {
          ...context,
          firstName: recipient.firstName,
          amountCents: 0,
        } as TemplateContext,
        sentBy: actorId ?? null,
        // Nobody's ledger moved. A finance event for a vote would file a
        // pledge ballot in somebody's payment history.
        audit: false,
        // The one case in the app that clears the bar in
        // `DeliveryRequest.timeSensitive`: a vote is open for minutes, closes
        // without warning, and cannot be seen from outside the app. A push
        // that waits for a Focus to end is a push that arrives after the
        // ballot box is shut.
        timeSensitive: true,
      }))
    );

    logger.info(
      {
        voteId: String(vote?._id),
        type: vote?.type,
        recipients: audience.length,
        sent: report?.sentCount ?? 0,
      },
      "Vote announced"
    );
    return report?.sentCount ?? 0;
  } catch (err: any) {
    logger.error({ err, voteId: String(vote?._id) }, "Failed to announce vote");
    return 0;
  }
}
