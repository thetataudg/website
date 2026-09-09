import mongoose, { Schema, model, models } from "mongoose";

/// A "when can we meet?" poll.
///
/// A committee head opens one, every member of the roster is asked to paint
/// their availability on a grid, the cron chases the non-responders on its own
/// schedule, and then the solver ranks the times that actually work so the head
/// can turn the winner into a real chapter `Event` in one click.
///
/// The grid is stored as flattened slot indices, not a bitmask:
///   index = dateIndex * slotsPerDay + slotIndex
///   slotsPerDay = floor((dayEndMinute - dayStartMinute) / slotMinutes)
/// A fully-available member on a 14-day x 8am-10pm x 30-min grid is ~392 ints,
/// which is nothing for a ~100-person chapter and stays readable in Compass.
const InviteeSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const ResponseSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    slots: { type: [Number], default: [] },
    updatedAt: { type: Date, default: () => new Date() },
    /// "manual" when the member painted it themselves, "prefill" when we seeded
    /// it from their RSVPs and the chapter calendar and they have not touched
    /// it yet. A prefill still counts as an answer for scoring, but the cron
    /// keeps nagging until it turns manual.
    source: { type: String, enum: ["manual", "prefill"], default: "manual" },
  },
  { _id: false }
);

const ReminderStateSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    sentCount: { type: Number, default: 0 },
    lastRemindedAt: { type: Date, default: null },
  },
  { _id: false }
);

const AvailabilityPollSchema = new Schema(
  {
    title: { type: String, required: true },
    /// URL-safe title, unique within the committee. Powers the shareable
    /// `/member/<committee>/poll/<slug>` link; the id route stays canonical.
    slug: { type: String, default: "" },
    description: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    /// Null for a chapter-wide poll. Otherwise the committee whose roster is
    /// the audience and whose events (plus chapter-wide ones) block a slot.
    committeeId: {
      type: Schema.Types.ObjectId,
      ref: "Committee",
      default: null,
    },
    status: {
      type: String,
      enum: ["open", "closed", "scheduled", "cancelled"],
      default: "open",
    },

    // --- the grid ---
    /// Which axis the columns are:
    ///   "dates"    - concrete Phoenix calendar days in `dates`
    ///   "weekdays" - an abstract "every Tuesday" grid in `weekdays`, no year
    /// The abstract mode is for a standing meeting slot: the head wants to know
    /// which weekday+time works, not which date.
    dateMode: {
      type: String,
      enum: ["dates", "weekdays"],
      default: "dates",
    },
    /// Phoenix calendar days, `["2026-09-14", ...]`. Not Dates: a poll day is a
    /// wall-clock date in Arizona, and storing it as a UTC instant would drift
    /// it across the date line for no reason.
    dates: { type: [String], default: [] },
    /// 1..7 (Mon..Sun), used when `dateMode === "weekdays"`. A column per entry,
    /// no date attached.
    weekdays: { type: [Number], default: [] },
    /// Minutes from midnight. 480..1320 is 8am..10pm.
    dayStartMinute: { type: Number, default: 480 },
    dayEndMinute: { type: Number, default: 1320 },
    slotMinutes: { type: Number, enum: [15, 30, 60], default: 30 },
    /// How long the meeting itself needs to be, so the solver only offers
    /// starts where it actually fits inside one day's window.
    meetingMinutes: { type: Number, default: 60 },

    // --- who was asked ---
    invitees: { type: [InviteeSchema], default: [] },

    // --- what they said ---
    responses: { type: [ResponseSchema], default: [] },

    // --- nagging, per poll ---
    //
    // This lives here rather than in `lib/notify/` because notify()'s cooldown
    // is keyed on (memberId, template) only, so two open polls would mute each
    // other. The availability templates are registered as transactional to
    // bypass that global cooldown, and the real cadence is owned here in
    // `reminderState` and enforced by `lib/availability/remind.ts` for both the
    // cron and the manual "Remind everyone" button.
    deadline: { type: Date, required: true },
    reminder: {
      cadenceHours: { type: Number, default: 24 },
      escalateToHead: { type: Boolean, default: true },
      finalCallHours: { type: Number, default: 24 },
      maxReminders: { type: Number, default: 5 },
    },
    reminderState: { type: [ReminderStateSchema], default: [] },
    headDigestSentAt: { type: Date, default: null },
    finalCallSentAt: { type: Date, default: null },

    // --- outcome ---
    scheduledEventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
  },
  { timestamps: true }
);

/// The cron sweep walks open polls by deadline.
AvailabilityPollSchema.index({ status: 1, deadline: 1 });
/// "Polls waiting on me" is the member portal's first list.
AvailabilityPollSchema.index({ "invitees.memberId": 1, status: 1 });
/// Resolving a shared /member/<committee>/poll/<slug> link.
AvailabilityPollSchema.index({ committeeId: 1, slug: 1 });

// Next re-evaluates this module on hot reload but `models` lives on the global
// mongoose instance, so a schema registered before an edit survives it — which
// is how a newly added field comes to be silently missing from the compiled
// model. `Event.ts` and `Committee.ts` carry the same guard for the same
// reason.
if (process.env.NODE_ENV === "development" && models.AvailabilityPoll) {
  delete models.AvailabilityPoll;
}

const AvailabilityPoll =
  models.AvailabilityPoll || model("AvailabilityPoll", AvailabilityPollSchema);
export default AvailabilityPoll;
