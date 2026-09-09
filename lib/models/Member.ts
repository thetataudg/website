// lib/models/Member.ts
import mongoose, { Schema, model, models } from "mongoose";

const MemberSchema = new Schema(
  {
    discordId: { type: String, default: undefined },
    clerkId: { type: String, required: false, default: undefined },
    /// Cached from Clerk, which is the system of record for it.
    ///
    /// Held here so a sixty-person email send is one database read rather than
    /// sixty API calls. Refreshed opportunistically by the notification
    /// pipeline; `emailSyncedAt` is how it knows what has gone stale.
    email: { type: String, default: null },
    emailSyncedAt: { type: Date, default: null },
    rollNo: { type: String, required: true, unique: true },
    fName: { type: String, required: true },
    lName: { type: String, required: true },
    majors: [{ type: String }],
    minors: [{ type: String }],
    gradYear: { type: Number, required: false },
    bigs: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    littles: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    bio: { type: String },
    headline: { type: String },
    pronouns: { type: String },
    skills: [{ type: String }],
    funFacts: [{ type: String }],
    projects: [
      {
        title: { type: String },
        description: { type: String },
        link: { type: String },
      },
    ],
    work: [
      {
        title: { type: String },
        organization: { type: String },
        start: { type: String },
        end: { type: String },
        description: { type: String },
        link: { type: String },
      },
    ],
    awards: [
      {
        title: { type: String },
        issuer: { type: String },
        date: { type: String },
        description: { type: String },
      },
    ],
    customSections: [
      {
        title: { type: String },
        body: { type: String },
      },
    ],
    committees: [{ type: String }],
    previousECouncilRoles: { type: [String], default: [] },
    previousCommitteesChaired: { type: [String], default: [] },
    previousCommitteesMemberOf: { type: [String], default: [] },
    familyLine: { type: String },
    pledgeClass: { type: String },
    isECouncil: { type: Boolean, required: true, default: false },
    ecouncilPosition: { type: String },
    isCommitteeHead: { type: Boolean, required: true, default: false },
    hometown: { type: String },
    resumeUrl: { type: String },
    profilePicUrl: { type: String },
    isHidden: { type: Boolean, default: false },
    // Set as soon as the member asks to delete their account. The profile is
    // hidden at the same time; the previous value lets a cancellation restore
    // exactly what was true before the request.
    accountDeletionRequestedAt: { type: Date, default: null },
    accountDeletionPreviousHidden: { type: Boolean, default: false },
    socialLinks: { type: Map, of: String, default: {} },
    status: {
      type: String,
      enum: ["Active", "Alumni", "Removed", "Deceased"],
      default: "Active",
    },
    role: {
      type: String,
      enum: ["superadmin", "admin", "member"],
      default: "member",
    },
    needsProfileReview: { type: Boolean, required: true, default: true },
    needsPermissionReview: { type: Boolean, required: true, default: true },
    /// When this member last made an authenticated request, and from what.
    ///
    /// Written by `lib/presence.ts` off the user agent of any call that passes
    /// through one of the `require*` guards, so it covers the whole app rather
    /// than only the members who granted push. `lastSeenAt` is the most recent
    /// request from anywhere; the platform-specific stamps are kept separately
    /// because "opened the app today" and "opened the website today" are
    /// different questions, and a member who does both would otherwise have
    /// whichever they touched last overwrite the other.
    lastSeenAt: { type: Date, default: null },
    lastSeenPlatform: {
      type: String,
      enum: ["ios", "web", "unknown", ""],
      default: "",
    },
    lastSeenIosAt: { type: Date, default: null },
    lastSeenWebAt: { type: Date, default: null },
  },
  { timestamps: true }
);

MemberSchema.index(
  { clerkId: 1 },
  {
    unique: true,
    partialFilterExpression: { clerkId: { $type: "string" } },
  }
);

/// The admin device console sorts the roster by iPhone recency.
MemberSchema.index({ lastSeenIosAt: -1 });

MemberSchema.index(
  { discordId: 1 },
  {
    unique: true,
    partialFilterExpression: { discordId: { $type: "string" } },
  }
);

if (process.env.NODE_ENV === "development" && models.Member) {
  delete models.Member;
}

const Member = models.Member || model("Member", MemberSchema);
export default Member;
