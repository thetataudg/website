import mongoose, { Schema, model, models } from "mongoose";

/// One custom message an officer sent from the Notification Center.
///
/// The per-member `Notification` rows are each recipient's copy; this is the
/// officer's record of the send as a whole: who wrote it, what it said, who it
/// was aimed at, and what happened on every channel for every person. History
/// reads only this collection, so it never has to reassemble a send from
/// hundreds of bell rows.
const RecipientResultSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    name: { type: String, default: "" },
    rollNo: { type: String, default: "" },
    status: { type: String, default: "" },
    attempts: {
      type: [
        new Schema(
          {
            channel: { type: String, required: true },
            delivered: { type: Boolean, required: true },
            reason: { type: String, default: undefined },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const NotificationBroadcastSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" },
    /// Object key in the newsletter bucket. Served to mail clients and the
    /// notification service extension through `/api/notification-images/<id>`,
    /// which re-signs on every request, because a push or an email is opened
    /// long after any presigned URL would have expired.
    imageKey: { type: String, default: "" },
    channels: { type: [String], default: [] },
    /// What the officer picked, kept so History can say "Alumni + Finance
    /// committee" rather than only a list of names.
    audience: {
      groups: { type: [String], default: [] },
      committeeIds: { type: [String], default: [] },
      memberIds: { type: [String], default: [] },
    },
    audienceLabel: { type: String, default: "" },
    /// A send to the author alone, from the "Send test to me" button.
    isTest: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["sending", "sent", "partial", "failed"],
      default: "sending",
    },
    recipientCount: { type: Number, default: 0 },
    /// Recipients reached on at least one of the chosen channels.
    reachedCount: { type: Number, default: 0 },
    /// Per-channel delivered counts, e.g. { push: 31, email: 40 }.
    channelCounts: { type: Map, of: Number, default: {} },
    recipients: { type: [RecipientResultSchema], default: [] },
    sentBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    sentByName: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationBroadcastSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === "development" && models.NotificationBroadcast) {
  delete models.NotificationBroadcast;
}

const NotificationBroadcast =
  models.NotificationBroadcast ||
  model("NotificationBroadcast", NotificationBroadcastSchema);
export default NotificationBroadcast;
