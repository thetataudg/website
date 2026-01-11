// lib/models/Member.ts
import mongoose, { Schema, model, models } from "mongoose";

const MemberSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    rollNo: { type: String, required: true, unique: true },
    fName: { type: String, required: true },
    lName: { type: String, required: true },
    majors: [{ type: String }],
    minors: [{ type: String }],
    gradYear: { type: Number, required: true },
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
    familyLine: { type: String },
    pledgeClass: { type: String },
    isECouncil: { type: Boolean, required: true },
    ecouncilPosition: { type: String },
    isCommitteeHead: { type: Boolean, required: true, default: false },
    hometown: { type: String },
    resumeUrl: { type: String },
    profilePicUrl: { type: String },
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
  },
  { timestamps: true }
);

const Member = models.Member || model("Member", MemberSchema);
export default Member;
