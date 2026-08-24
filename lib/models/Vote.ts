import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema({
  type: { type: String, required: true }, // "Election", "Pledge", or "Bidding"
  title: { type: String }, // Optional title for Election votes
  options: [{ type: String }], // for Election
  pledges: [{ type: String }], // for Pledge
  rushees: [{ type: String }], // for Bidding
  snapBids: [{ type: String }], // Array of rushee names that have been snap bidded (for Bidding)
  round: { type: String, enum: ["board", "blackball"], default: "board" }, // for Pledge
  started: { type: Boolean, default: false },
  ended: { type: Boolean, default: false },
  startedAt: { type: Date }, // When the vote was started
  endTime: { type: Date }, // When the vote is scheduled to end
  invalidatedBallots: [{ type: String }], // Array of clerkIds whose ballots have been invalidated
  pledgeValidCons: { type: Map, of: Boolean, default: {} }, // Maps pledge name to whether they have a valid con
  voterListVerified: { type: Boolean, default: false }, // Whether E-Council has verified the voter list
  removedOptions: [{ type: String }], // Array of options that were removed after proxy votes were cast

  /// When the vote actually closed.
  ///
  /// `ended` alone could only say *whether*, and the list needs to say *how
  /// long ago*: a vote closes, sits at the top of the finished list while the
  /// room talks about it, and then gets out of the way.
  endedAt: { type: Date },

  /// Set when a vote is archived by hand, ahead of the automatic move.
  ///
  /// The automatic one is derived from `endedAt` rather than written, because a
  /// timer that has to fire to change a row's category is a timer that will
  /// eventually not fire. This field only records the manual override.
  archivedAt: { type: Date },

  /// When this document deletes itself.
  ///
  /// Backed by a TTL index, so the cleanup is Mongo's job rather than a cron
  /// nobody remembers to keep alive. Set when the vote ends; a vote that never
  /// ran has no expiry and stays until somebody removes it.
  purgeAt: { type: Date },

  /// Where the chapter is actually meeting for this vote.
  ///
  /// Set by E-Council before or during the vote. Ballots are compared against
  /// it so a ballot cast from the other side of town — without being marked as
  /// a proxy — can be surfaced for review. The comparison is all it is used
  /// for: see `VoteLocation` for why the resulting points are stored apart
  /// from the ballots themselves.
  votingLocation: {
    lat: { type: Number },
    lng: { type: Number },
    label: { type: String },
    /// How far from the anchor still counts as "at chapter". Generous by
    /// default: a GPS fix indoors is routinely off by tens of metres, and a
    /// false flag against an anonymous ballot is not something anyone can
    /// clear up afterwards.
    radiusMeters: { type: Number, default: 200 },
    setAt: { type: Date },
  },

  /// Proxy voting is a request, not a switch.
  ///
  /// A proxy ballot is cast before the vote opens and by someone who will not
  /// be in the room, so the chapter has to agree to it in advance rather than
  /// discover it in the tally. Each member may hold one request per vote;
  /// only an approved one unlocks the ballot early.
  proxyRequests: [
    {
      clerkId: { type: String, required: true },
      reason: { type: String },
      status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
      requestedAt: { type: Date, default: Date.now },
      decidedAt: { type: Date },
      /// clerkId of the officer who decided. Recorded on the *request*, which
      /// is not a secret ballot — the ballot itself stays anonymous.
      decidedBy: { type: String },
      decisionNote: { type: String },
    },
  ],
  votes: [
    {
      clerkId: { type: String, required: true },
      pledge: { type: String }, // for Pledge
      rushee: { type: String }, // for Bidding
      choice: { type: String, required: true }, // "Continue", "Board", "Blackball", "Bid", "No Bid", or election option
      round: { type: String }, // "board" or "blackball"
      proxy: { type: Boolean, default: false }, // whether this vote was submitted as a proxy before the vote started
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// `expireAfterSeconds: 0` means "delete once the date in this field passes",
// which is the form to use when each document carries its own deadline.
VoteSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Vote || mongoose.model("Vote", VoteSchema);