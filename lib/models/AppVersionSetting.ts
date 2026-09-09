import mongoose, { Schema, model, models } from "mongoose";

/// The minimum iOS version, when an admin has set one.
///
/// Singleton, keyed the way `LockdownState` is. Absent means "nobody has set
/// one", and the code constant in `lib/appVersion.ts` is used instead — so the
/// gate still has a sane floor on a fresh database.
const AppVersionSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "ios" },
    /// Dotted numeric, e.g. "1.2" or "1.2.1". Validated at the route.
    minimumVersion: { type: String, required: true },
    /// Who last raised it, so a chapter-wide lockout has a name against it.
    updatedBy: { type: String, default: "" },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

const AppVersionSetting =
  models.AppVersionSetting || model("AppVersionSetting", AppVersionSettingSchema);

export default AppVersionSetting;
