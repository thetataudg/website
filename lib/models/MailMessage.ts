// lib/models/MailMessage.ts
import { Schema, model, models } from "mongoose";

export const MAIL_FOLDERS = ["inbox", "sent", "drafts", "archive", "junk", "trash"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

const AttachmentSchema = new Schema(
  {
    filename: { type: String, default: "attachment" },
    contentType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    /// Where the bytes live in our bucket. Empty until an inbound attachment
    /// has been copied out of Resend.
    storageKey: { type: String, default: "" },
    /// Resend's id for an inbound attachment, kept so a download that races
    /// the copy can still be fetched straight from Resend.
    resendAttachmentId: { type: String, default: "" },
    contentId: { type: String, default: "" },
    inline: { type: Boolean, default: false },
    state: { type: String, enum: ["pending", "ready", "failed"], default: "ready" },
  },
  { _id: false }
);

/// One message in one mailbox.
///
/// Every query in the app is scoped by `accountId`, and that is the privacy
/// model: a message sent between two chapter addresses is stored twice, once
/// per mailbox, so neither side's read state, folder or deletion ever touches
/// the other's copy.
const MailMessageSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "MailAccount", required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    folder: { type: String, enum: MAIL_FOLDERS, default: "inbox" },
    threadId: { type: String, required: true },
    /// RFC Message-ID, angle brackets included. How replies find their thread.
    messageId: { type: String, default: "" },
    inReplyTo: { type: String, default: "" },
    references: { type: [String], default: [] },
    from: { type: String, default: "" },
    fromName: { type: String, default: "" },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    replyTo: { type: [String], default: [] },
    subject: { type: String, default: "" },
    text: { type: String, default: "" },
    /// Sanitized on the way in. Never stored raw.
    html: { type: String, default: "" },
    snippet: { type: String, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },
    read: { type: Boolean, default: false },
    starred: { type: Boolean, default: false },
    labels: { type: [String], default: [] },
    resendEmailId: { type: String, default: null },
    deliveryStatus: {
      type: String,
      enum: ["draft", "queued", "sent", "delivered", "delayed", "bounced", "complained", "failed", "received"],
      default: "received",
    },
    /// When it arrived or left. The sort key for every list.
    date: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

MailMessageSchema.index({ accountId: 1, folder: 1, date: -1 });
MailMessageSchema.index({ accountId: 1, threadId: 1, date: 1 });
MailMessageSchema.index({ accountId: 1, messageId: 1 });
// Webhook retries land on the same (email, mailbox) pair and must not
// duplicate. Partial so outgoing drafts, which have no Resend id, never collide.
MailMessageSchema.index(
  { resendEmailId: 1, accountId: 1 },
  { unique: true, partialFilterExpression: { resendEmailId: { $type: "string" } } }
);
MailMessageSchema.index({ subject: "text", snippet: "text", from: "text", fromName: "text" });

if (process.env.NODE_ENV === "development" && models.MailMessage) {
  delete models.MailMessage;
}

const MailMessage = models.MailMessage || model("MailMessage", MailMessageSchema);
export default MailMessage;
