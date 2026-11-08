// lib/models/Counter.ts
// Named sequences (bug report refs). `findOneAndUpdate` + `$inc` is atomic.
import { Schema, model, models } from "mongoose";

const CounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === "development" && models.Counter) {
  delete models.Counter;
}

const Counter = models.Counter || model("Counter", CounterSchema);
export default Counter;

export async function nextSequence(key: string): Promise<number> {
  const row = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean<any>();
  return row.seq;
}
