// lib/notify/announce.ts
// The single call every money-moving route makes after it has written its
// FinanceEvent, and the only place that decides who hears about it.
//
// The routing rule, in one place so it can't drift between twenty routes:
//
//   - The active Treasurer hears about **everything**, whoever caused it.
//     Their email copy goes to treasurer@thetatau-dg.org.
//   - The member hears when somebody **else** moved their ledger. They don't
//     get told about their own submission — they just made it, and the screen
//     already said so.
//
// Nothing in here can fail a request. Announcing is a courtesy laid on top of a
// record that already exists: if the push dies, the money still moved and the
// audit row still says so. Every path is caught and logged.
import logger from "@/lib/logger";
import { notify, type NotifyInput } from "@/lib/notify";
import {
  displayName,
  memberName,
  memberRecipient,
  treasuryRecipients,
} from "@/lib/notify/audience";
import {
  officerTemplateFor,
  renderOfficerMessage,
  type NotifyTemplate,
  type TemplateContext,
} from "@/lib/notify/templates";

/// Whether the person who performed the action gets the officer copy of it.
///
/// On by default. Suppressing it reads as the obviously correct behaviour —
/// nobody needs a push saying they did the thing they just did — but a chapter
/// with one officer then sees an empty feed, and "the notifications don't work"
/// is the conclusion people reach. Set NOTIFY_SUPPRESS_ACTOR=1 to turn the
/// self-copy off once there are enough officers for it to be noise.
function includeActor(): boolean {
  return process.env.NOTIFY_SUPPRESS_ACTOR !== "1";
}

export interface AnnounceRefs {
  chargeId?: any;
  planId?: any;
  reimbursementId?: any;
  submissionId?: any;
}

export interface AnnounceInput {
  /// The FinanceEvent type just recorded. Drives the officer headline.
  event: string;
  /// Whose ledger moved.
  memberId: any;
  /// Who moved it. Null for the nightly job.
  actorId?: any | null;
  amountCents?: number | null;
  /// The same sentence written to the FinanceEvent. Reused verbatim so the
  /// notification and the audit row can never disagree.
  summary: string;
  refs?: AnnounceRefs;
  /// The warm, member-facing message — set only when the member should hear
  /// about this. Omit for anything the member did themselves.
  member?: {
    template: NotifyTemplate;
    context: Partial<TemplateContext>;
  } | null;
}

/// Tell everyone who needs to know about one movement on one member's ledger.
export async function announce(input: AnnounceInput): Promise<void> {
  try {
    const [concerned, treasury, actorName] = await Promise.all([
      memberRecipient(input.memberId),
      treasuryRecipients(),
      input.actorId ? memberName(input.actorId) : Promise.resolve(""),
    ]);

    const refs = input.refs ?? {};
    const amountCents = input.amountCents ?? null;
    const sends: Promise<any>[] = [];

    // --- the member, when this was done to them ---
    let memberTold = false;
    if (input.member && concerned) {
      memberTold = true;
      sends.push(
        notify({
          recipient: concerned,
          template: input.member.template,
          context: {
            firstName: concerned.firstName,
            amountCents: amountCents ?? 0,
            ...input.member.context,
          } as TemplateContext,
          amountCents,
          refs,
          sentBy: input.actorId ?? null,
        })
      );
    }

    // --- the Treasurer, always ---
    const message = renderOfficerMessage({
      event: input.event,
      memberName: displayName(concerned),
      actorName,
      summary: input.summary,
    });
    const template = officerTemplateFor(input.event);
    const suppressActor = !includeActor();

    for (const officer of treasury) {
      const id = String(officer.memberId);
      // One notification per person per event. An officer who is also the
      // member in question already got the version written for them, which is
      // the better of the two — don't buzz their phone twice for one fact.
      if (memberTold && concerned && id === String(concerned.memberId)) continue;
      if (suppressActor && input.actorId && id === String(input.actorId)) continue;

      sends.push(
        notify({
          recipient: officer,
          template,
          // Unused on this path — the message below is already rendered — but
          // the field is required and the amount is what the pipeline stamps
          // onto the row.
          context: { firstName: officer.firstName, amountCents: amountCents ?? 0 },
          message,
          amountCents,
          refs,
          sentBy: input.actorId ?? null,
          // See NotifyInput.audit: this is somebody else's money.
          audit: false,
        })
      );
    }

    // Settled rather than raced, so one bad address can't take down the rest.
    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      logger.warn(
        { event: input.event, failed: failed.length, of: results.length },
        "Some ledger notifications did not go out"
      );
    }
  } catch (err: any) {
    logger.warn(
      { err, event: input.event },
      "Announce failed — the ledger change it describes still happened"
    );
  }
}

export interface AnnounceBulkInput {
  event: string;
  actorId?: any | null;
  /// One sentence covering the whole batch, already composed by the caller.
  summary: string;
  amountCents?: number | null;
}

/// The officer half only, for an action taken against many members at once.
///
/// Assigning dues to sixty people is one decision an officer made, not sixty
/// things that happened. Fanning it out per member would put three hundred
/// notifications on five phones and get the whole feature muted by morning —
/// which is the same failure the reminder cooldown exists to prevent, arriving
/// by a different door. The members themselves are told individually, as
/// before; it's only the officer feed that collapses.
export async function announceBulk(input: AnnounceBulkInput): Promise<void> {
  try {
    const [treasury, actorName] = await Promise.all([
      treasuryRecipients(),
      input.actorId ? memberName(input.actorId) : Promise.resolve(""),
    ]);

    const message = renderOfficerMessage({
      event: input.event,
      memberName: "The chapter",
      actorName,
      summary: input.summary,
    });
    const template = officerTemplateFor(input.event);
    const suppressActor = !includeActor();

    const sends = treasury
      .filter(
        (officer) =>
          !(suppressActor && input.actorId &&
            String(officer.memberId) === String(input.actorId))
      )
      .map((officer) =>
        notify({
          recipient: officer,
          template,
          context: {
            firstName: officer.firstName,
            amountCents: input.amountCents ?? 0,
          },
          message,
          amountCents: input.amountCents ?? null,
          refs: {},
          sentBy: input.actorId ?? null,
          audit: false,
        } as NotifyInput)
      );

    await Promise.allSettled(sends);
  } catch (err: any) {
    logger.warn({ err, event: input.event }, "Bulk announce failed");
  }
}
