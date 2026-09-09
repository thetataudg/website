import { Schema, model, models } from "mongoose";

/// A note that an admin signed someone out, so the member can be told why.
///
/// Clerk ends a revoked session and forgets it, and a member who is suddenly
/// back at the sign-in page has no way to tell an admin action from an expired
/// token. That reads as the site being broken. This row is the difference, and
/// it exists only long enough to deliver the message.
///
/// Keyed on the session rather than the member: someone signed out of a shared
/// laptop while their phone stays signed in should be told about the laptop,
/// once, and not again the next time they sign in somewhere.
const RevokedSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    clerkId: { type: String, required: true, index: true },
    /// The roll number of the admin who did it, for the audit trail. Never
    /// shown to the member — being told a brother signed you out invites an
    /// argument the console cannot referee.
    revokedByRollNo: { type: String, default: "" },
    deviceLabel: { type: String, default: "" },
    revokedAt: { type: Date, default: () => new Date() },
    /// Set once the member has been shown the notice, so it appears exactly
    /// once rather than on every visit until the row expires.
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/// Self-cleaning. The message is only useful while the member is still
/// wondering what happened; a day later it is noise, and keeping a record of
/// who was signed out of what is not something this app needs to retain.
RevokedSessionSchema.index({ revokedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

if (process.env.NODE_ENV === "development" && models.RevokedSession) {
  delete models.RevokedSession;
}

const RevokedSession =
  models.RevokedSession || model("RevokedSession", RevokedSessionSchema);
export default RevokedSession;
