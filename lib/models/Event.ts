import mongoose, { Schema, model, models } from "mongoose";
import { GEM_CATEGORIES } from "@/lib/gem";

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
    eventType: {
      type: String,
      enum: ["meeting", "event", "chapter"],
      default: "event",
    },
    gemCategory: {
      type: String,
      enum: GEM_CATEGORIES,
      default: null,
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
    // Who *said* they're coming. Distinct from `attendees`, which is who
    // actually checked in at the door — an RSVP is an intention, attendance is
    // a fact, and GEM only ever counts the latter.
    rsvps: [
      {
        memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
        status: {
          type: String,
          enum: ["going", "maybe", "not_going"],
          required: true,
        },
        respondedAt: { type: Date, default: () => new Date() },
      },
    ],
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
        // Which NFC tag they tapped, when that's how they got here. Null for
        // every other path, which is how a roster tells them apart.
        //
        // The label is copied rather than looked up through the token: a tag
        // gets rewritten for the next event, and last week's roster should
        // still say "Front door" instead of resolving to whatever that token
        // points at now.
        boothToken: { type: String, default: null },
        boothLabel: { type: String, default: null },
      },
    ],
    // Armed NFC check-in tags. One entry per physical tag, because a front
    // door and a side entrance are different booths and an officer wants to
    // know which one somebody came through.
    //
    // Writing a tag mints a new token, so the previous event's token stops
    // resolving the moment the tag is rewritten — revocation without an
    // expiry to get wrong.
    checkInBooths: [
      {
        token: { type: String, required: true },
        label: { type: String, default: "" },
        armedAt: { type: Date, default: () => new Date() },
        armedBy: {
          type: Schema.Types.ObjectId,
          ref: "Member",
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

// A member taps a tag and the server has only the token — no event id — so
// this is the lookup that has to be fast. Sparse because most events never
// arm a booth at all.
EventSchema.index({ "checkInBooths.token": 1 }, { sparse: true });

// Next's dev server re-evaluates this module on hot reload but `models` lives
// on the global mongoose instance, so a schema registered before an edit
// survives it. That's how `rsvps` came to be missing from the compiled model
// while it was present in the file — every write to it silently no-opped and
// then threw. `Member.ts` carries the same guard for the same reason.
if (process.env.NODE_ENV === "development" && models.Event) {
  delete models.Event;
}

const Event = models.Event || model("Event", EventSchema);
export default Event;
