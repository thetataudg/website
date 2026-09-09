import mongoose, { Schema } from "mongoose";

/**
 * Whether a member was at chapter when they voted — and nothing about what
 * they voted for.
 *
 * The companion to `VoteLocation`, and the reason there are two collections
 * instead of one. The chapter needs two different answers that must never be
 * available together:
 *
 *  - *Where did the ballots come from?* — `VoteLocation`. Carries coordinates,
 *    carries no member, and is built so it cannot be re-attributed to one.
 *  - *Who voted from outside?* — this. Carries the member, and carries no
 *    coordinates and no choices.
 *
 * That split is what keeps the ballot secret. Naming a member on a record that
 * also held their choices would end the secret ballot outright; naming them on
 * a record that holds only a distance says exactly as much as the roll already
 * says out loud, which is that they voted and how they voted is nobody's
 * business. The roll already publishes voted / proxy / no-ballot per member;
 * "and from 4.2 km away" belongs to the same class of fact.
 *
 * No `lat`/`lng` here on purpose. A distance from a known anchor answers the
 * integrity question; a named coordinate is a member's home address, which the
 * chapter has no business keeping in order to run a vote.
 */
const VotePresenceSchema = new Schema({
  voteId: { type: Schema.Types.ObjectId, required: true, index: true },
  clerkId: { type: String, required: true },

  /// Metres from the vote's anchor, or null when E-Council set no anchor.
  /// Rounded to the metre, same as the map's points.
  distanceMeters: { type: Number, default: null },
  /// Horizontal accuracy the device reported. A 500m fix 250m outside the
  /// boundary is not evidence of anything, and the roll says so rather than
  /// putting a badge on somebody's name.
  accuracyMeters: { type: Number, default: null },

  /// Outside the anchor's radius, on a fix tight enough to mean it. Says
  /// nothing about whether that was allowed — an approved proxy is outside on
  /// purpose. The roll pairs this with the proxy standing it already knows.
  outside: { type: Boolean, default: false },

  /// Matches the parent vote's expiry, stamped when the vote closes.
  purgeAt: { type: Date },
}, { versionKey: false });

/// One record per member per vote. Ballots cannot be re-cast, but the upsert
/// this enforces is what keeps a retried request from writing a second row.
VotePresenceSchema.index({ voteId: 1, clerkId: 1 }, { unique: true });
VotePresenceSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.VotePresence ||
  mongoose.model("VotePresence", VotePresenceSchema);
