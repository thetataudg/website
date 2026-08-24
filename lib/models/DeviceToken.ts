import mongoose, { Schema, model, models } from "mongoose";

/// An iOS device that has agreed to receive push.
///
/// Keyed on the token itself rather than the member, because one person can
/// carry two phones and a token can migrate between accounts when a device is
/// handed on. Apple tells us when a token is dead; `disabledAt` records that
/// rather than deleting the row, so a device that stops working is visible
/// instead of silently absent.
const DeviceTokenSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["ios"], default: "ios" },
    /// "development" or "production" — an APNs token minted against the sandbox
    /// is rejected by the production gateway and vice versa, which is the most
    /// common reason push "just doesn't work".
    environment: { type: String, default: "development" },
    appVersion: { type: String, default: "" },
    lastSeenAt: { type: Date, default: () => new Date() },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: "" },
  },
  { timestamps: true }
);

DeviceTokenSchema.index({ memberId: 1, disabledAt: 1 });

if (process.env.NODE_ENV === "development" && models.DeviceToken) {
  delete models.DeviceToken;
}

const DeviceToken =
  models.DeviceToken || model("DeviceToken", DeviceTokenSchema);
export default DeviceToken;
