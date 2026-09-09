// lib/appVersion.ts
//
// What the iOS app is allowed to be running.
//
// A plain constant rather than an environment variable: raising the floor is a
// deliberate, reviewable act, and it should show up in the diff of whoever
// does it. Bump it here, redeploy the site, and every older build is blocked
// at its next launch. No App Store review is involved.

import { APP_STORE_APP_ID, APP_STORE_URL } from "@/lib/appleAppSiteAssociation";

/**
 * The oldest iOS build allowed to run. Anything below this is hard-blocked by
 * the app's own gate at launch.
 *
 * Two rules for raising it, both learned the expensive way if ignored:
 *
 *  1. Never set it above a version that is actually live on the App Store. A
 *     blocked member has exactly one way forward — the store listing — so a
 *     premature bump bricks the app for everyone who has not updated yet.
 *  2. Never set it above the build currently in App Review. The reviewer runs
 *     the submitted binary, and a reviewer who hits a wall rejects.
 *
 * It also cannot usefully exceed the first version that *contains* the gate:
 * builds older than that never ask, so they are not blocked by it.
 */
export const MINIMUM_IOS_VERSION = "1.0";

/** The newest build shipped. Advisory: the app does not block on this. */
export const LATEST_IOS_VERSION = "2.0";

/** Dotted numeric, one to four components. "1", "1.2", "1.2.3" all pass. */
export function isValidVersionString(value: unknown): boolean {
  return /^\d{1,5}(\.\d{1,5}){0,3}$/.test(String(value ?? "").trim());
}

/**
 * Negative when `a` is older than `b`, positive when newer, 0 when equal.
 *
 * Component-wise and numeric. Compared as strings "1.10" sorts below "1.9",
 * which would quietly let every build past 1.9 through the gate. Mirrors
 * `SemVer.isOlder` in the iOS app; the two must agree.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".").map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  const pb = String(b).split(".").map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export { APP_STORE_APP_ID, APP_STORE_URL };
