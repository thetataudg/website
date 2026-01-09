import mongoose, { Schema, model, models } from "mongoose";

const EventSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    location: { type: String, default: "" },
    gemPointDurationMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled"],
      default: "scheduled",
    },
    visibleToAlumni: { type: Boolean, default: true },
    attendees: [
      {
        memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
        checkedInAt: { type: Date, required: true },
      },
    ],
  },
  { timestamps: true }
);

const Event = models.Event || model("Event", EventSchema);
export default Event;
