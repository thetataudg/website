import mongoose, { Schema, model, models } from "mongoose";

const MemberSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },

    rollNo: { type: String, required: true, unique: true },
    fName: { type: String, required: true },
    lName: { type: String, required: true },

    majors: [{ type: String }],
    gradYear: { type: Number, required: true },

    bigs: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    littles: [{ type: Schema.Types.ObjectId, ref: "Member" }],

    bio: { type: String },
    committees: [{ type: String }],

    familyLine: { type: String },
    pledgeClass: { type: String },

    isECouncil: { type: Boolean, required: true },
    ecouncilPosition: { type: String },

    hometown: { type: String },

    resumeUrl: { type: String },
    profilePicUrl: { type: String },

    socialLinks: {
      type: Map,
      of: String,
      default: {},
    },

    status: {
      type: String,
      enum: ["Active", "Alumni", "Removed", "Deceased"],
      default: "Active",
    },

    isAdmin: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

const Member = models.Member || model("Member", MemberSchema);
export default Member;
