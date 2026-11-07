// lib/models/BugReportMessage.ts
// The thread on a bug report. `internal` notes are for the tech committee
// only: never on the public page, never emailed.
import { Schema, model, models } from "mongoose";

const BugReportMessageSchema = new Schema(
  {
    bugReportId: { type: Schema.Types.ObjectId, ref: "BugReport", required: true },
    authorMemberId: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    visibility: { type: String, enum: ["public", "internal"], default: "public" },
    /// "staff" for the tech committee, "reporter" otherwise. Decides whose
    /// name the reporter sees ("Technology committee" for staff).
    authorRole: { type: String, enum: ["staff", "reporter"], default: "reporter" },
    body: { type: String, default: "", maxlength: 10000 },
    screenshotKeys: { type: [String], default: [] },
  },
  { timestamps: true }
);

BugReportMessageSchema.index({ bugReportId: 1, createdAt: 1 });

if (process.env.NODE_ENV === "development" && models.BugReportMessage) {
  delete models.BugReportMessage;
}

const BugReportMessage = models.BugReportMessage || model("BugReportMessage", BugReportMessageSchema);
export default BugReportMessage;
