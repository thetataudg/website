import mongoose, { Schema } from "mongoose";
import { randomUUID } from "crypto";

/**
 * Where a ballot was cast from — and deliberately nothing about who cast it.
 *
 * The bylaws make chapter votes anonymous, so this cannot live inside the
 * `votes[]` array on the Vote document: that array carries `clerkId`, and a
 * location sitting beside it would name the person standing at that point on
 * the map. It is a separate collection with no member reference at all.
 *
 * Separating the documents is not enough on its own. Three things would still
 * re-join them:
 *
 *  - **Array position.** `$push` preserves order, so the nth geo entry would
 *    be the nth ballot. Hence a separate collection rather than a second array.
 *  - **The `_id`.** A Mongo ObjectId encodes its creation time to the second,
 *    which is more than enough to line documents up against the ballots in
 *    submission order. So `_id` is a random UUID string instead.
 *  - **Timestamps.** Same problem, so there is no `createdAt`. The coarsest
 *    useful grain is the day, and that is all `dayKey` records.
 *
 * Reads must sort by `shuffleKey`, which is random and fixed at write time, so
 * the natural insertion order of the collection never leaks either.
 */
const VoteLocationSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  voteId: { type: Schema.Types.ObjectId, required: true, index: true },

  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  /// Horizontal accuracy the device reported, in metres. A 500m fix sitting
  /// just outside the boundary is not evidence of anything, and the integrity
  /// view says so rather than flagging it.
  accuracyMeters: { type: Number, default: null },

  /// Whether the ballot was submitted as an approved proxy. This is the whole
  /// point of the record: a ballot cast far from chapter *and* marked proxy is
  /// expected, and one cast far from chapter without the marking is not.
  proxy: { type: Boolean, default: false },

  /// What was voted for, with no voter attached — "Abstain", an election
  /// option, or the set of choices on a pledge/bidding ballot.
  choices: [{ type: String }],

  /// Metres from the vote's anchor, or null when no anchor was set.
  distanceMeters: { type: Number, default: null },
  /// Outside the anchor's radius and not marked proxy.
  flagged: { type: Boolean, default: false },

  /// Random, fixed at write time. Every read sorts by this.
  shuffleKey: { type: Number, default: () => Math.random(), index: true },
  /// "2026-08-24". Coarse on purpose — see the note above.
  dayKey: { type: String },

  /// Matches the parent vote's own expiry, stamped across the whole set when
  /// the vote closes. Without it these would outlive the vote they describe,
  /// which is a pile of location data belonging to nothing.
  purgeAt: { type: Date },
}, { versionKey: false });

VoteLocationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.VoteLocation ||
  mongoose.model("VoteLocation", VoteLocationSchema);
