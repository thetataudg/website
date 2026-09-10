// lib/models/MailAccount.ts
import { Schema, model, models } from "mongoose";

/// A member's @mail.ttdg.org mailbox, or their request for one.
///
/// One per member, enforced by the unique index on `memberId`. A pending row
/// already holds its address, so two people can never be waiting on the same
/// one and have the second approval fail.
const MailAccountSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    /// Full address, lowercase. The thing inbound mail is routed on.
    address: { type: String, required: true, lowercase: true, trim: true },
    localPart: { type: String, required: true, lowercase: true, trim: true },
    /// What goes in front of the address on outgoing mail.
    displayName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "active", "rejected", "suspended"],
      default: "pending",
    },
    requestedAt: { type: Date, default: () => new Date() },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewComments: { type: String, default: "" },
  },
  { timestamps: true }
);

MailAccountSchema.index({ memberId: 1 }, { unique: true });
MailAccountSchema.index({ address: 1 }, { unique: true });
MailAccountSchema.index({ status: 1, requestedAt: 1 });

if (process.env.NODE_ENV === "development" && models.MailAccount) {
  delete models.MailAccount;
}

const MailAccount = models.MailAccount || model("MailAccount", MailAccountSchema);
export default MailAccount;
