// lib/models/MailAccount.ts
import { Schema, model, models } from "mongoose";

/// A @mail.ttdg.org mailbox.
///
/// Two kinds. A personal one belongs to a member (or is their request for
/// one), and each member has at most one: the partial unique index on
/// `memberId`. A role mailbox belongs to a committee, like technology@, and
/// `memberId` is whoever heads that committee right now. When the head changes
/// the mailbox, and everything in it, moves to the new head.
const MailAccountSchema = new Schema(
  {
    kind: { type: String, enum: ["personal", "role"], default: "personal" },
    /// The personal owner, or a role mailbox's current holder. Null for a role
    /// mailbox whose committee has no head.
    memberId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", default: null },
    /// Full address, lowercase. The thing inbound mail is routed on.
    address: { type: String, required: true, lowercase: true, trim: true },
    localPart: { type: String, required: true, lowercase: true, trim: true },
    /// What goes in front of the address on outgoing mail.
    displayName: { type: String, default: "" },
    status: {
      type: String,
      /// `suspended` is paused: no access, no delivery, address and mail kept,
      /// and it resumes as it was. `revoked` is closed by an admin: the same,
      /// but the member is told it has been taken away rather than paused.
      enum: ["pending", "active", "rejected", "suspended", "revoked"],
      default: "pending",
    },
    /// Set when an admin paused it, as opposed to the automatic freeze when a
    /// member is marked Removed or Deceased. Only the automatic kind thaws on
    /// its own when their status comes back.
    pausedByAdmin: { type: Boolean, default: false },
    /// The last admin action taken on a live mailbox, for the admin console.
    statusChangedBy: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusNote: { type: String, default: "" },
    /// Gmail's "Signature defaults": what a new message starts with, and what a
    /// reply or forward starts with. Null is no signature.
    defaultSignatureNew: { type: Schema.Types.ObjectId, ref: "MailSignature", default: null },
    defaultSignatureReply: { type: Schema.Types.ObjectId, ref: "MailSignature", default: null },
    requestedAt: { type: Date, default: () => new Date() },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewComments: { type: String, default: "" },
  },
  { timestamps: true }
);

MailAccountSchema.index(
  { memberId: 1 },
  { unique: true, partialFilterExpression: { kind: "personal" }, name: "personal_owner_unique" }
);
MailAccountSchema.index(
  { committeeId: 1 },
  { unique: true, partialFilterExpression: { kind: "role" }, name: "committee_mailbox_unique" }
);
MailAccountSchema.index({ address: 1 }, { unique: true });
MailAccountSchema.index({ status: 1, requestedAt: 1 });

if (process.env.NODE_ENV === "development" && models.MailAccount) {
  delete models.MailAccount;
}

const MailAccount = models.MailAccount || model("MailAccount", MailAccountSchema);
export default MailAccount;
