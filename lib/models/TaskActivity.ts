// lib/models/TaskActivity.ts
// A task's timeline: comments and system events in one list. Its own
// collection so a long-running task stays small.
import { Schema, model, models } from "mongoose";
import { ACTIVITY_KINDS } from "@/lib/tasks/constants";

const TaskActivitySchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    body: { type: String, default: "", maxlength: 10000 },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    from: { type: Schema.Types.Mixed, default: null },
    to: { type: Schema.Types.Mixed, default: null },
    mentions: [{ type: Schema.Types.ObjectId, ref: "Member" }],
  },
  { timestamps: true }
);

TaskActivitySchema.index({ taskId: 1, createdAt: 1 });
TaskActivitySchema.index({ committeeId: 1, createdAt: -1 });

if (process.env.NODE_ENV === "development" && models.TaskActivity) {
  delete models.TaskActivity;
}

const TaskActivity = models.TaskActivity || model("TaskActivity", TaskActivitySchema);
export default TaskActivity;
