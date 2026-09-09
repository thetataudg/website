// lib/appVersionStore.ts
//
// Resolves the minimum iOS version: whatever an admin has set, falling back to
// the constant in `lib/appVersion.ts`.

import { connectDB } from "@/lib/db";
import AppVersionSetting from "@/lib/models/AppVersionSetting";
import { MINIMUM_IOS_VERSION, isValidVersionString } from "@/lib/appVersion";

export type ResolvedMinimum = {
  version: string;
  /// True when it came from the database rather than the code default.
  isCustom: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
};

export async function resolveMinimumIosVersion(): Promise<ResolvedMinimum> {
  try {
    await connectDB();
    const doc = await AppVersionSetting.findOne({ key: "ios" }).lean<any>();
    // A stored value that no longer parses must not lock anybody out, so the
    // code constant wins over anything malformed.
    if (doc?.minimumVersion && isValidVersionString(doc.minimumVersion)) {
      return {
        version: String(doc.minimumVersion).trim(),
        isCustom: true,
        updatedBy: doc.updatedBy || undefined,
        updatedByName: doc.updatedByName || undefined,
        updatedAt: doc.updatedAt?.toISOString?.(),
      };
    }
  } catch {
    // A database that is down must not block the app. Fall through.
  }
  return { version: MINIMUM_IOS_VERSION, isCustom: false };
}
