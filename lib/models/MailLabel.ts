// lib/models/MailLabel.ts
import { Schema, model, models } from "mongoose";

/// A label a member made in their own mailbox, Gmail-style. Messages carry
/// label ids in `MailMessage.labels`; renaming a label renames it everywhere.
const MailLabelSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "MailAccount", required: true },
    name: { type: String, required: true, trim: true },
    /// One of the palette keys the mail UI knows how to draw.
    color: { type: String, default: "gray" },
    /// One of `LABEL_ICONS` in lib/mail/labels.ts.
    icon: { type: String, default: "tag" },
  },
  { timestamps: true }
);

MailLabelSchema.index({ accountId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

if (process.env.NODE_ENV === "development" && models.MailLabel) {
  delete models.MailLabel;
}

const MailLabel = models.MailLabel || model("MailLabel", MailLabelSchema);
export default MailLabel;
