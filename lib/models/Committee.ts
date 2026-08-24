import mongoose, { Schema, model, models } from "mongoose";
import { CALENDAR_COLORS } from "@/lib/calendarColors";

const CommitteeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    committeeHeadId: { type: Schema.Types.ObjectId, ref: "Member" },
    committeeMembers: [{ type: Schema.Types.ObjectId, ref: "Member" }],
    events: [{ type: Schema.Types.ObjectId, ref: "Event" }],
    // A palette *key*, not a hex value — each client picks the shade that
    // works in its own appearance, so the same committee reads correctly in
    // light mode and in dark. See `lib/calendarColors.ts`.
    color: { type: String, enum: CALENDAR_COLORS, default: null },
  },
  { timestamps: true }
);

// Next re-evaluates this module on hot reload but `models` lives on the global
// mongoose instance, so a schema registered before an edit survives it — which
// is how a newly added field comes to be silently missing from the compiled
// model. `Event.ts` carries the same guard for the same reason.
if (process.env.NODE_ENV === "development" && models.Committee) {
  delete models.Committee;
}

const Committee = models.Committee || model("Committee", CommitteeSchema);
export default Committee;
