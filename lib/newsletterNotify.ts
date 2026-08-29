// lib/newsletterNotify.ts
// Telling the chapter an issue is out.
//
// Modelled on `lib/notify/announce.ts` and bound by the same rule: announcing
// is a courtesy laid on top of a record that already exists. The article is
// published the moment the document says so. If APNs is down, or half the
// roster has no email on file, that must not turn a successful publish into a
// failed request, so nothing in here throws.
import logger from "@/lib/logger";
import { notify } from "@/lib/notify";
import { chapterRecipients } from "@/lib/notify/audience";
import { newsletterPath } from "@/lib/newsletterTypes";
import { siteUrl } from "@/lib/siteUrl";
import type { RenderedMessage } from "@/lib/notify/templates";

export interface NewsletterAnnouncement {
  title: string;
  slug: string;
  summary: string;
  authorName: string;
  /// The officer who hit publish, for the `sentBy` stamp on each row.
  actorId?: any | null;
}

/// The cover, at an address that will still resolve next week.
///
/// Not the presigned URL from the feed. A mail client fetches images when the
/// reader opens the message, which may be days after it was sent, and a
/// signature that expired in the meantime arrives as a broken box in the one
/// place there is no second chance to fix it. This route redirects to a fresh
/// signature on every request.
function coverUrl(slug: string): string {
  return `${siteUrl()}/api/newsletters/${encodeURIComponent(slug)}/cover`;
}

/// One issue, announced once.
///
/// The caller is responsible for only calling this on the *first* publish:
/// `notifiedAt` on the document is the guard, and it is set by the route
/// before this runs so a retried request cannot double-send.
export async function announceNewsletter(
  input: NewsletterAnnouncement
): Promise<number> {
  try {
    const recipients = await chapterRecipients();
    if (!recipients.length) {
      logger.warn({ slug: input.slug }, "No chapter recipients for newsletter");
      return 0;
    }

    const link = newsletterPath(input.slug);
    // One rendered message for everybody. Nothing here is personalised, and
    // rendering it per recipient would be sixty copies of the same four
    // strings.
    //
    // No em dashes anywhere in this copy: it lands on a lock screen and in an
    // inbox, and the house style for member-facing wording is plain commas.
    const message: RenderedMessage = {
      // What the bell says. The row is one line in a list of chapter events,
      // so it leads with the kind of thing it is; the headline follows in the
      // body underneath it.
      title: "New newsletter",
      body: `${input.title}. ${input.summary}`.trim(),
      // Comfortably inside the ~120 characters iOS will show. The title is the
      // part worth reading on a lock screen, so the summary is left off rather
      // than truncated mid-sentence.
      push: input.title.slice(0, 110),
      emailSubject: input.title,
      link,
      category: "general",
      // Set explicitly. Left to `ctaLabelFor`, an unrecognised path falls back
      // to the dues wording, and a newsletter email would have shipped with a
      // button reading "Open your dues".
      ctaLabel: "Read the newsletter",
      // The inbox gets the article treatment rather than the receipt one: the
      // cover photo, the real headline, and a left-aligned column that reads
      // like something written rather than something owed.
      email: {
        eyebrow: "New newsletter",
        title: input.title,
        heroImageUrl: coverUrl(input.slug),
        heroImageAlt: input.title,
        align: "left",
        paragraphs: [
          "A new newsletter was just posted.",
          input.summary,
        ].filter((line) => line.trim().length > 0),
        // Says why this landed in their inbox, which is what a broadcast owes
        // the reader and a receipt does not.
        footnote: "You're getting this because you're an active member of the chapter.",
        // The subject is the headline, so repeating it in the preview line
        // would waste the one bit of extra room the inbox gives.
        preheader: input.summary || `Published by the ${input.authorName}.`,
      },
    };

    let sent = 0;
    // Serial rather than Promise.all. Sixty simultaneous APNs streams and
    // sixty simultaneous email sends is how you get rate limited by both at
    // once, and nobody is waiting on this: the response has already gone.
    for (const recipient of recipients) {
      try {
        const result = await notify({
          recipient,
          template: "broadcast_newsletter_published",
          context: {} as any,
          message,
          amountCents: null,
          sentBy: input.actorId ?? null,
          // Not a movement on anybody's ledger. Auditing this would write a
          // `reminder_sent` row onto sixty financial timelines for an article.
          audit: false,
        });
        if (result.sent) sent += 1;
      } catch (err: any) {
        logger.warn(
          { err, rollNo: recipient.rollNo, slug: input.slug },
          "Newsletter notification failed for one member"
        );
      }
    }

    logger.info({ slug: input.slug, sent, of: recipients.length }, "Newsletter announced");
    return sent;
  } catch (err: any) {
    logger.error({ err, slug: input.slug }, "Could not announce newsletter");
    return 0;
  }
}
