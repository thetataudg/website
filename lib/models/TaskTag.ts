// lib/models/TaskTag.ts
// Per-committee task labels.
import { Schema, model, models } from "mongoose";
import { TAG_COLORS } from "@/lib/tasks/constants";

const TaskTagSchema = new Schema(
  {
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", required: true },
    name: { type: String, required: true, maxlength: 40 },
    color: { type: String, enum: TAG_COLORS, default: "gray" },
  },
  { timestamps: true }
);

TaskTagSchema.index({ committeeId: 1, name: 1 }, { unique: true });

if (process.env.NODE_ENV === "development" && models.TaskTag) {
  delete models.TaskTag;
}

const TaskTag = models.TaskTag || model("TaskTag", TaskTagSchema);
export default TaskTag;
