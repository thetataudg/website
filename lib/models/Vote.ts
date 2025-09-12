import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema({
  type: { type: String, required: true }, // "Election" or "Pledge"
  options: [{ type: String }], // for Election
  pledges: [{ type: String }], // for Pledge
  round: { type: String, enum: ["board", "blackball"], default: "board" }, // for Pledge
  started: { type: Boolean, default: false },
  ended: { type: Boolean, default: false },
  votes: [
    {
      clerkId: { type: String, required: true },
      pledge: { type: String }, // for Pledge
      choice: { type: String, required: true }, // "Continue", "Board", "Blackball"
      round: { type: String }, // "board" or "blackball"
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Vote || mongoose.model("Vote", VoteSchema);