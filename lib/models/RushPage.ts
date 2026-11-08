// lib/models/RushPage.ts
// The editable /rush page, as one keyed document (key "public"). Missing means
// "render the defaults", which is what the page did before the editor.
import { Schema, model, models } from "mongoose";

const RushEventSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 120 },
    startsAt: { type: Date, required: true },
    location: { type: String, default: "", maxlength: 120 },
    featuring: { type: String, default: "", maxlength: 160 },
    hidden: { type: Boolean, default: false },
  },
  { _id: true }
);

const RushPageSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "public" },
    isOpen: { type: Boolean, default: true },
    eyebrow: { type: String, default: "" },
    title: { type: String, default: "" },
    intro: { type: String, default: "" },
    closedIntro: { type: String, default: "" },
    closedMessage: { type: String, default: "" },
    interestFormUrl: { type: String, default: "" },
    interestFormLabel: { type: String, default: "" },
    eventsHeading: { type: String, default: "" },
    whyText: { type: String, default: "" },
    startTitle: { type: String, default: "" },
    startText: { type: String, default: "" },
    events: { type: [RushEventSchema], default: [] },
    poster: {
      key: { type: String, default: null },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      alt: { type: String, default: "Rush flyer" },
      hidden: { type: Boolean, default: false },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    updatedByName: { type: String, default: "" },
    /// Newest first, capped at 20, for "Restore previous version".
    revisions: {
      type: [
        new Schema(
          {
            savedAt: Date,
            savedByName: String,
            snapshot: Schema.Types.Mixed,
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === "development" && models.RushPage) {
  delete models.RushPage;
}

const RushPage = models.RushPage || model("RushPage", RushPageSchema);
export default RushPage;
