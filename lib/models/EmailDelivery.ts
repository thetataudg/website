// lib/models/EmailDelivery.ts
//
// A local record of the emails Clerk says it sent on our behalf.
//
// Clerk's Invitations API carries no delivery information at all: an invitation
// object is only { id, email_address, status, url, expires_at }, where `status`
// means pending/accepted/revoked, not sent/delivered. The one place Clerk
// reports on the email itself is the `email.created` webhook, so we capture
// those as they arrive and join them back onto invitations by address.
import mongoose, { Schema, model, models } from "mongoose";

const EmailDeliverySchema = new Schema(
  {
    /// Clerk's id for the email object. The upsert key, so a redelivered
    /// webhook updates the existing row instead of adding a duplicate.
    clerkEmailId: { type: String, required: true, unique: true, index: true },
    /// Lowercased, because this is what invitations are matched on and Clerk
    /// does not promise a consistent case.
    toEmailAddress: { type: String, required: true, index: true },
    /// Which template fired: "invitation", "verification_code", and so on.
    slug: { type: String, default: null },
    /// Clerk's own word for where the message got to. In practice this is the
    /// status at the moment the email was created, usually "queued".
    status: { type: String, default: null },
    subject: { type: String, default: null },
    /// False when the instance is configured to hand delivery off to its own
    /// provider, in which case Clerk knows nothing beyond handing it over.
    deliveredByClerk: { type: Boolean, default: null },
    provider: { type: String, enum: ["clerk", "resend"], default: null },
    providerMessageId: { type: String, default: null },
    sendError: { type: String, default: null },
    /// When Clerk created the email, not when we received the webhook.
    occurredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Newest-first lookups for "what happened to this address most recently".
EmailDeliverySchema.index({ toEmailAddress: 1, occurredAt: -1 });

export default models.EmailDelivery ||
  model("EmailDelivery", EmailDeliverySchema);
