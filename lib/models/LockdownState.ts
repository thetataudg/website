import mongoose, { Schema, model, models } from "mongoose";

export type LockdownRecord = {
  key: string;
  active: boolean;
  reason?: string;
  createdBy?: string;
  startedAt?: Date;
  endsAt?: Date;
  durationMinutes?: number;
};

const LockdownStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    active: { type: Boolean, required: true, default: false },
    reason: { type: String, default: "" },
    durationMinutes: { type: Number, default: 0 },
    startedAt: { type: Date },
    endsAt: { type: Date },
    createdBy: { type: String },
  },
  { timestamps: true }
);

const LockdownState = models.LockdownState || model("LockdownState", LockdownStateSchema);

export default LockdownState;
