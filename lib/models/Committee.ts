import mongoose, { Schema, model, models } from "mongoose";

const CommitteeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    committeeHeadId: { type: Schema.Types.ObjectId, ref: "Member" },
    committeeMembers: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    events: [{ type: Schema.Types.ObjectId, ref: "Event" }],
  },
  { timestamps: true }
);

const Committee = models.Committee || model("Committee", CommitteeSchema);
export default Committee;
