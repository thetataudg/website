// lib/models/BugReport.ts
// A problem a member reported at /report. Private to the reporter, its
// subscribers and the tech committee. `publicTitle` is reserved for a future
// public "Known issues" list.
import { Schema, model, models } from "mongoose";
import { AREAS, PUBLIC_STATUSES, SEVERITIES } from "@/lib/bugs/constants";

const BugReportSchema = new Schema(
  {
    /// Displayed "TTDG-R<ref>" (see formatRef). A random four-digit number.
    ref: { type: Number, required: true, unique: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 10000 },
    area: { type: String, enum: AREAS, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    pageUrl: { type: String, default: "", maxlength: 500 },
    userAgent: { type: String, default: "", maxlength: 500 },
    appVersion: { type: String, default: "", maxlength: 40 },
    screenshotKeys: { type: [String], default: [] },
    reporterMemberId: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    publicStatus: { type: String, enum: PUBLIC_STATUSES, default: "received" },
    /// Set by "Need info" and cleared when the reporter replies.
    needsInfo: { type: Boolean, default: false },
    duplicateOfId: { type: Schema.Types.ObjectId, ref: "BugReport", default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    subscriberMemberIds: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    publicTitle: { type: Boolean, default: false },
    lastPublicActivityAt: { type: Date, default: () => new Date() },
    reporterLastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

BugReportSchema.index({ publicStatus: 1, createdAt: -1 });
BugReportSchema.index({ subscriberMemberIds: 1 });
BugReportSchema.index({ title: "text" });

if (process.env.NODE_ENV === "development" && models.BugReport) {
  delete models.BugReport;
}

const BugReport = models.BugReport || model("BugReport", BugReportSchema);
export default BugReport;
