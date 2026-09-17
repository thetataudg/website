// lib/models/MailFilter.ts
import { Schema, model, models } from "mongoose";

/// A rule run on every incoming message, the same shape as a Gmail filter:
/// all the criteria that are filled in must match, then every action applies.
const MailFilterSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "MailAccount", required: true },
    criteria: {
      from: { type: String, default: "" },
      to: { type: String, default: "" },
      subject: { type: String, default: "" },
      hasWords: { type: String, default: "" },
      doesNotHave: { type: String, default: "" },
      hasAttachment: { type: Boolean, default: false },
    },
    actions: {
      skipInbox: { type: Boolean, default: false },
      markRead: { type: Boolean, default: false },
      star: { type: Boolean, default: false },
      labelId: { type: Schema.Types.ObjectId, default: null },
      trash: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

MailFilterSchema.index({ accountId: 1, createdAt: 1 });

if (process.env.NODE_ENV === "development" && models.MailFilter) {
  delete models.MailFilter;
}

const MailFilter = models.MailFilter || model("MailFilter", MailFilterSchema);
export default MailFilter;
