// lib/mail/notify.ts
// The bell and push side of chapter mail. Never email: every send counts
// against the shared daily budget, and "you have mail" arriving by email is
// the one notification that costs as much as the mail it announces.
import { notifyQuietly, recipientFor } from "@/lib/notify";
import { officerRecipients } from "@/lib/notify/audience";
import type { RenderedMessage } from "@/lib/notify/templates";

function message(partial: Omit<RenderedMessage, "category" | "emailSubject"> & { emailSubject?: string }): RenderedMessage {
  return { category: "mail", emailSubject: partial.title, ...partial };
}

export async function notifyOfficersOfMailRequest(memberName: string, address: string): Promise<void> {
  const officers = await officerRecipients().catch(() => []);
  const admins = officers; // officerRecipients already covers admins and E-Council
  const msg = message({
    title: "Chapter email request",
    body: `${memberName} requested ${address}.`,
    push: `${memberName} requested ${address}.`,
    link: "/member/admin/pending",
  });
  await Promise.all(
    admins.map((recipient) =>
      notifyQuietly({
        recipient,
        template: "officer_mail_request",
        context: {} as any,
        message: msg,
        channels: ["push"],
        audit: false,
      })
    )
  );
}

export async function notifyMailDecision(memberId: any, decision: "approved" | "rejected", address: string): Promise<void> {
  const recipient = await recipientFor(memberId);
  if (!recipient) return;
  const approved = decision === "approved";
  await notifyQuietly({
    recipient,
    template: "broadcast_mail_decision",
    context: {} as any,
    message: message({
      title: approved ? "Your chapter email is ready" : "Chapter email request not approved",
      body: approved ? `You can now send and receive mail as ${address}.` : `Your request for ${address} was not approved.`,
      push: approved ? `${address} is ready to use.` : `Your request for ${address} was not approved.`,
      link: "/member/mail",
    }),
    // The decision email is sent separately, to the member's personal address.
    channels: ["push"],
    audit: false,
  });
}

export async function notifyNewMail(
  memberId: any,
  mail: {
    fromLabel: string;
    subject: string;
    preview: string;
    messageId: string;
    threadId: string;
    mailboxId: string;
    /// Set for a committee mailbox, so "technology" shows which inbox it hit.
    mailboxLabel: string;
  }
): Promise<void> {
  const recipient = await recipientFor(memberId);
  if (!recipient) return;
  const subject = mail.subject.trim() || "(no subject)";
  const preview = mail.preview.replace(/\s+/g, " ").trim();
  await notifyQuietly({
    recipient,
    template: "broadcast_mail_received",
    context: {} as any,
    message: message({
      title: "New chapter mail",
      body: `${mail.fromLabel}: ${subject}`.slice(0, 200),
      // Sender, subject, first line: what Apple Mail's own banner shows.
      pushTitle: mail.fromLabel.slice(0, 80),
      pushSubtitle: (mail.mailboxLabel ? `[${mail.mailboxLabel}] ${subject}` : subject).slice(0, 120),
      push: (preview || subject).slice(0, 178),
      pushThreadId: `mail-${mail.threadId}`,
      // Straight to the message, not just the inbox.
      link: `/member/mail?mailbox=${encodeURIComponent(mail.mailboxId)}&message=${encodeURIComponent(mail.messageId)}`,
    }),
    channels: ["push"],
    audit: false,
  });
}
