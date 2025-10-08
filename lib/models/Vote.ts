import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema({
  type: { type: String, required: true }, // "Election" or "Pledge"
  title: { type: String }, // Optional title for Election votes
  options: [{ type: String }], // for Election
  pledges: [{ type: String }], // for Pledge
  round: { type: String, enum: ["board", "blackball"], default: "board" }, // for Pledge
  started: { type: Boolean, default: false },
  ended: { type: Boolean, default: false },
  endTime: { type: Date }, // When the vote is scheduled to end
  votes: [
    {
      clerkId: { type: String, required: true },
      pledge: { type: String }, // for Pledge
      choice: { type: String, required: true }, // "Continue", "Board", "Blackball", or election option
      round: { type: String }, // "board" or "blackball"
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Vote || mongoose.model("Vote", VoteSchema);