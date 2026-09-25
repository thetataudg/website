import { signNewsletterImage } from "@/lib/newsletterStorage";

/// A send left in "sending" this long was cut off by a restart rather than
/// still going: the whole chapter takes well under a minute.
const STALE_AFTER_MS = 15 * 60 * 1000;

export async function serializeBroadcast(row: any, withRecipients: boolean) {
  const createdAt = new Date(row.createdAt);
  const interrupted =
    row.status === "sending" && Date.now() - createdAt.getTime() > STALE_AFTER_MS;
  const channelCounts =
    row.channelCounts instanceof Map
      ? Object.fromEntries(row.channelCounts)
      : row.channelCounts ?? {};

  return {
    id: String(row._id),
    title: row.title,
    body: row.body,
    link: row.link,
    imageUrl: row.imageKey ? await signNewsletterImage(row.imageKey) : "",
    channels: row.channels ?? [],
    audienceLabel: row.audienceLabel ?? "",
    isTest: Boolean(row.isTest),
    status: interrupted ? "interrupted" : row.status,
    recipientCount: row.recipientCount ?? 0,
    reachedCount: row.reachedCount ?? 0,
    channelCounts,
    sentByName: row.sentByName ?? "",
    createdAt: createdAt.toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    ...(withRecipients
      ? {
          recipients: (row.recipients ?? []).map((recipient: any) => ({
            memberId: String(recipient.memberId),
            name: recipient.name,
            rollNo: recipient.rollNo,
            status: recipient.status,
            attempts: recipient.attempts ?? [],
          })),
        }
      : {}),
  };
}
