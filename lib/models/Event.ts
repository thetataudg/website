import mongoose, { Schema, model, models } from "mongoose";

const EventSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    committeeId: {
      type: Schema.Types.ObjectId,
      ref: "Committee",
      required: false,
      default: null,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    location: { type: String, default: "" },
    calendarEventId: { type: String, default: null },
    gemPointDurationMinutes: { type: Number, default: 0 },
    eventType: {
      type: String,
      enum: ["meeting", "event", "chapter"],
      default: "event",
    },
    recurrence: {
      enabled: { type: Boolean, default: false },
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "weekly",
      },
      interval: { type: Number, default: 1 },
      endDate: { type: Date, default: null },
      count: { type: Number, default: 1 },
    },
    recurrenceParentId: { type: Schema.Types.ObjectId, ref: "Event" },
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
        source: { type: String, default: null },
        scannerMemberId: {
          type: Schema.Types.ObjectId,
          ref: "Member",
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

const Event = models.Event || model("Event", EventSchema);
export default Event;
