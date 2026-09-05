import mongoose, { Schema, model, models } from "mongoose";

/// One thing the chapter told a member.
///
/// The in-app channel's storage, and the only channel that can't fail for a
/// reason outside this codebase — no vendor, no domain, no provisioning. That's
/// why it's the one the rest of the pipeline is built around: an email can
/// bounce and a push token can go stale, but the member can always open the app
/// and find out what they were told.
const NotificationSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    /// The template that produced this — `overdue`, `payment_verified`. Also
    /// the cooldown key: one reminder per member per template per 24 hours.
    template: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    /// Where tapping it should land. Relative, so the website and the app can
    /// each map it to their own routing.
    link: { type: String, default: "" },
    category: {
      type: String,
      enum: ["dues", "reimbursement", "plan", "general"],
      default: "dues",
    },
    amountCents: { type: Number, default: null },
    readAt: { type: Date, default: null },
    /// Which channels actually accepted it. A reminder is recorded whether or
    /// not any external channel worked, so this is how you tell "we sent it and
    /// email was down" from "we never tried".
    channels: { type: [String], default: [] },
    /// Every attempted channel, including failures and configuration skips.
    /// `channels` remains the compact list of successful deliveries used by
    /// existing clients; this is the diagnostic trail for everything else.
    deliveryAttempts: {
      type: [
        new Schema(
          {
            channel: { type: String, required: true },
            delivered: { type: Boolean, required: true },
            reason: { type: String, default: undefined },
            attemptedAt: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    refs: {
      chargeId: { type: Schema.Types.ObjectId, default: null },
      planId: { type: Schema.Types.ObjectId, default: null },
      reimbursementId: { type: Schema.Types.ObjectId, default: null },
      submissionId: { type: Schema.Types.ObjectId, default: null },
    },
    sentBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

// The only read pattern: one member's bell, newest first.
NotificationSchema.index({ memberId: 1, createdAt: -1 });
// The cooldown lookup: has this person had this template in the last 24h?
NotificationSchema.index({ memberId: 1, template: 1, createdAt: -1 });

if (process.env.NODE_ENV === "development" && models.Notification) {
  delete models.Notification;
}

const Notification =
  models.Notification || model("Notification", NotificationSchema);
export default Notification;
