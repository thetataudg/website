// lib/mail/serialize.ts
// What the browser is allowed to see of a message.

export function toListItem(m: any) {
  return {
    id: String(m._id),
    threadId: m.threadId,
    folder: m.folder,
    direction: m.direction,
    from: m.from,
    fromName: m.fromName,
    to: m.to ?? [],
    subject: m.subject || "(no subject)",
    snippet: m.snippet ?? "",
    read: Boolean(m.read),
    starred: Boolean(m.starred),
    labels: m.labels ?? [],
    hasAttachments: (m.attachments ?? []).some((a: any) => !a.inline),
    deliveryStatus: m.deliveryStatus,
    date: m.date,
  };
}

export function toDetail(m: any) {
  return {
    ...toListItem(m),
    cc: m.cc ?? [],
    bcc: m.direction === "out" ? m.bcc ?? [] : [],
    replyTo: m.replyTo ?? [],
    messageId: m.messageId,
    references: m.references ?? [],
    text: m.text ?? "",
    html: m.html ?? "",
    attachments: (m.attachments ?? []).map((a: any, index: number) => ({
      index,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      inline: Boolean(a.inline),
      contentId: a.contentId,
      state: a.state,
      url: `/api/mail/attachments/${String(m._id)}/${index}`,
      // A draft reopened in the composer has to send these again.
      key: m.folder === "drafts" ? a.storageKey : undefined,
    })),
  };
}

export function toAccount(a: any) {
  if (!a) return null;
  return {
    id: String(a._id),
    address: a.address,
    localPart: a.localPart,
    displayName: a.displayName,
    status: a.status,
    requestedAt: a.requestedAt,
    reviewedAt: a.reviewedAt,
    reviewComments: a.reviewComments || "",
  };
}
