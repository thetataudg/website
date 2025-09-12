import mongoose, { Schema } from "mongoose";

const VoteSchema = new Schema({
  type: { type: String, required: true }, // "Election"
  options: [{ type: String, required: true }],
  started: { type: Boolean, default: false },
  ended: { type: Boolean, default: false },
  votes: [
    {
      clerkId: { type: String, required: true },
      choice: { type: String, required: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Vote || mongoose.model("Vote", VoteSchema);