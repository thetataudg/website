import mongoose, { Schema, model, models } from "mongoose";

const MinuteSchema = new Schema(
  {
    meetingDate: { type: Date, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    activesPresent: { type: Number, required: true },
    quorumRequired: { type: Boolean, required: true, default: false },
    executiveSummary: { type: String, required: true, default: "" },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    eventName: { type: String, default: "" },
    minutesUrl: { type: String, required: true },
    minutesKey: { type: String, required: true },
    meetingDateKey: { type: String, required: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Minute = models.Minute || model("Minute", MinuteSchema);
export default Minute;
