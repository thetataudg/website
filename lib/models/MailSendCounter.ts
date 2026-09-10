// lib/models/MailSendCounter.ts
import { Schema, model, models } from "mongoose";

/// How many emails the app has handed to Resend on one UTC day.
///
/// Resend's free plan caps the whole account at 100 a day, shared by dues
/// notices, invitations and member mail alike. Counting it ourselves is what
/// lets member mail stop short of the cap and leave room for the rest.
const MailSendCounterSchema = new Schema({
  date: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  memberCount: { type: Number, default: 0 },
});

if (process.env.NODE_ENV === "development" && models.MailSendCounter) {
  delete models.MailSendCounter;
}

const MailSendCounter =
  models.MailSendCounter || model("MailSendCounter", MailSendCounterSchema);
export default MailSendCounter;
