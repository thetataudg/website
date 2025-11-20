import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema({
  type: { type: String, required: true }, // "Election" or "Pledge"
  title: { type: String }, // Optional title for Election votes
  options: [{ type: String }], // for Election
  pledges: [{ type: String }], // for Pledge
  round: { type: String, enum: ["board", "blackball"], default: "board" }, // for Pledge
  started: { type: Boolean, default: false },
  ended: { type: Boolean, default: false },
  startedAt: { type: Date }, // When the vote was started
  endTime: { type: Date }, // When the vote is scheduled to end
  invalidatedBallots: [{ type: String }], // Array of clerkIds whose ballots have been invalidated
  pledgeValidCons: { type: Map, of: Boolean, default: {} }, // Maps pledge name to whether they have a valid con
  voterListVerified: { type: Boolean, default: false }, // Whether E-Council has verified the voter list
  removedOptions: [{ type: String }], // Array of options that were removed after proxy votes were cast
  votes: [
    {
      clerkId: { type: String, required: true },
      pledge: { type: String }, // for Pledge
      choice: { type: String, required: true }, // "Continue", "Board", "Blackball", or election option
      round: { type: String }, // "board" or "blackball"
      proxy: { type: Boolean, default: false }, // whether this vote was submitted as a proxy before the vote started
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Vote || mongoose.model("Vote", VoteSchema);