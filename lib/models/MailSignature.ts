// lib/models/MailSignature.ts
import { Schema, model, models } from "mongoose";

/// A saved signature in one mailbox. Which one is used by default lives on the
/// MailAccount, as in Gmail: one for new mail, one for replies and forwards.
const MailSignatureSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "MailAccount", required: true },
    name: { type: String, required: true, trim: true },
    /// Sanitized with the composer's own rules before it is stored.
    html: { type: String, default: "" },
    /// Existing signatures keep Gmail's conventional separator unless the
    /// member explicitly turns it off.
    includeSeparator: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MailSignatureSchema.index({ accountId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

if (process.env.NODE_ENV === "development" && models.MailSignature) {
  delete models.MailSignature;
}

const MailSignature = models.MailSignature || model("MailSignature", MailSignatureSchema);
export default MailSignature;
