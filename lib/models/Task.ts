// lib/models/Task.ts
// One task on a committee's tracker. Scoped by `committeeId` so any committee
// can run a tracker; the tech committee is just the first.
import { Schema, model, models } from "mongoose";
import { PRIORITIES, STATUSES } from "@/lib/tasks/constants";

const ChecklistItemSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 300 },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    assigneeId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { _id: true }
);

const TaskSchema = new Schema(
  {
    committeeId: { type: Schema.Types.ObjectId, ref: "Committee", required: true, index: true },
    /// Per-committee sequence; the key is `${prefix}-${number}`.
    number: { type: Number, required: true },
    /// The key's random half: `TTDG-${code}`. Unique across every committee.
    code: { type: String, default: null },
    /// Set when someone shares the task publicly; the public page reads it.
    shareToken: { type: String, default: null },
    /// Fields the auto-sorter filled, so the UI can say so.
    autoSorted: { type: Boolean, default: false },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 20000 },
    status: { type: String, enum: STATUSES, default: "todo" },
    priority: { type: String, enum: PRIORITIES, default: "none" },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    tagIds: [{ type: Schema.Types.ObjectId, ref: "TaskTag" }],
    /// An instant. An all-day due date is 23:59 Phoenix on that day.
    dueAt: { type: Date, default: null },
    dueAllDay: { type: Boolean, default: true },
    checklist: { type: [ChecklistItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    statusChangedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    /// Bumped by any edit or comment; drives "stale".
    lastActivityAt: { type: Date, default: () => new Date() },
    /// Board order inside a status column (fractional indexing).
    sortOrder: { type: Number, default: 0 },
    bugReportId: { type: Schema.Types.ObjectId, ref: "BugReport", default: null },
    archivedAt: { type: Date, default: null },
    /// Stamps that make every cron reminder fire at most once.
    reminderState: {
      dueSoonSentAt: { type: Date, default: null },
      overdueSentAt: { type: Date, default: null },
      staleSentAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

TaskSchema.index({ committeeId: 1, number: 1 }, { unique: true });
TaskSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string" } } });
TaskSchema.index({ shareToken: 1 }, { unique: true, partialFilterExpression: { shareToken: { $type: "string" } } });
TaskSchema.index({ committeeId: 1, status: 1, sortOrder: 1 });
TaskSchema.index({ assigneeIds: 1, status: 1 });
TaskSchema.index({ dueAt: 1, status: 1 });
TaskSchema.index({ title: "text" });

if (process.env.NODE_ENV === "development" && models.Task) {
  delete models.Task;
}

const Task = models.Task || model("Task", TaskSchema);
export default Task;
