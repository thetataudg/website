import mongoose, { Schema, model, models } from "mongoose";

const GemRecordSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    semester: { type: String, required: true },
    gpa: { type: Number, min: 0, max: 4, default: null },
  },
  { timestamps: true }
);

GemRecordSchema.index({ memberId: 1, semester: 1 }, { unique: true });

const GemRecord = models.GemRecord || model("GemRecord", GemRecordSchema);
export default GemRecord;
