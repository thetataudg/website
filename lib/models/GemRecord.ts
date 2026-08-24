import mongoose, { Schema, model, models } from "mongoose";
import { GEM_CRITERION_KEYS, GEM_STANDINGS } from "@/lib/gem";

/// A Section 2 substitution.
///
/// Article V lets a member replace a requirement or a point with a service to
/// the chapter, documented in writing and approved by a majority vote. That
/// vote happens in a room; this is where its outcome is written down, keyed to
/// the exact criterion it replaced so the GEM sheet can show *why* a row is
/// ticked without the attendance behind it.
const GemOverrideSchema = new Schema(
  {
    key: { type: String, enum: GEM_CRITERION_KEYS, required: true },
    /// False is meaningful, not just an absent true: a criterion attendance
    /// would otherwise satisfy can be revoked by the same vote.
    granted: { type: Boolean, required: true, default: true },
    /// The written documentation the bylaw asks for.
    note: { type: String, default: "" },
    setBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    setAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const GemRecordSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    semester: { type: String, required: true },
    /// Kept, but no longer scored. The Spring 2026 bylaw change dropped the
    /// 3.0 GPA point; the chapter still records the number.
    gpa: { type: Number, min: 0, max: 4, default: null },
    /// Where the member sits in the Article V, Section 3 process.
    standing: { type: String, enum: GEM_STANDINGS, default: "none" },
    /// Free text for Section 3.3 goals set by Membership Integrity.
    standingNote: { type: String, default: "" },
    overrides: { type: [GemOverrideSchema], default: [] },
  },
  { timestamps: true }
);

GemRecordSchema.index({ memberId: 1, semester: 1 }, { unique: true });

// See the note in `Event.ts`: a schema registered before an edit survives hot
// reload, so `overrides` would silently no-op on every write without this.
if (process.env.NODE_ENV === "development" && models.GemRecord) {
  delete models.GemRecord;
}

const GemRecord = models.GemRecord || model("GemRecord", GemRecordSchema);
export default GemRecord;
