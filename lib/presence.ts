// lib/presence.ts
// "Who is using what, and when did they last do it."
//
// Clerk knows about sessions, but its Backend API refuses to list them without
// a `user_id` or `client_id` — a chapter-wide count would be one HTTP request
// per member, on every page load. So the running count comes from our own
// database instead: every authenticated request stamps the member with the
// time and the platform it came from, which is one indexed write and gives an
// answer for members who never granted push as well.
//
// Clerk stays the drill-down. `lib/clerkDevices.ts` reads the real session
// rows for a single member when an admin asks for that member specifically.
import { headers } from "next/headers";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export type Platform = "ios" | "web" | "unknown";

/// How recently a member has to have been seen to count as "on right now".
///
/// The app talks to the server on launch and on most screens, so a phone in
/// active use refreshes this stamp several times over. Fifteen minutes is long
/// enough to survive a member reading one long page without touching the
/// network, and short enough that the number still means "now".
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

/// Writes are skipped when the last one for this member was under this old.
///
/// The stamp only needs to be accurate to the size of the active window, and
/// the app can easily make a dozen calls opening a single screen. Per server
/// instance, so a busy deploy across several instances writes a little more
/// often than this — still far less than once per request.
const WRITE_THROTTLE_MS = 5 * 60 * 1000;

const lastWriteByClerkId = new Map<string, number>();

/// The native app, as seen from the server.
///
/// It sets no user agent of its own on API calls, so what arrives is
/// URLSession's default — `Theta Tau/14 CFNetwork/3826.500.111.2.2
/// Darwin/24.4.0`. `CFNetwork` plus `Darwin` is the reliable half of that: the
/// bundle name is display text and would change with the app's name, and the
/// Clerk SDK sends its own `TTDG-Mobile-App/<version>` label on the auth calls
/// it makes directly.
///
/// Mobile Safari is deliberately NOT this. A member reading the members-only
/// site on their iPhone is on the website, and counting them as an app user
/// would make the number mean nothing.
const APP_USER_AGENT = /CFNetwork\/[\d.]+ Darwin\/[\d.]+/i;
const APP_LABEL = /TTDG-Mobile-App/i;

export function classifyUserAgent(userAgent: string): Platform {
  if (!userAgent) return "unknown";
  if (APP_LABEL.test(userAgent) || APP_USER_AGENT.test(userAgent)) return "ios";
  if (/Mozilla|Chrome|Safari|Firefox|Edg\//i.test(userAgent)) return "web";
  return "unknown";
}

/// The app's build number, when the user agent carries one.
///
/// `Theta Tau/14 CFNetwork/…` yields "14"; `TTDG-Mobile-App/1.4` yields "1.4".
/// Best effort — an unrecognised shape is an empty string, not a throw, since
/// this is only ever displayed.
export function appVersionFromUserAgent(userAgent: string): string {
  const labelled = userAgent.match(/TTDG-Mobile-App\/([\d.]+)/i);
  if (labelled) return labelled[1];
  const leading = userAgent.match(/^([^/]+)\/([\d.]+)\s+CFNetwork/i);
  if (leading) return leading[2];
  return "";
}

/// Stamp a member as seen, if enough time has passed since the last stamp.
///
/// Deliberately total: every failure path is swallowed and logged at debug.
/// This runs on the way into every authenticated route, and a presence stamp
/// failing is never a reason to fail the request the member actually made.
export async function recordPresence(clerkId: string): Promise<void> {
  try {
    const now = Date.now();
    const previous = lastWriteByClerkId.get(clerkId);
    if (previous !== undefined && now - previous < WRITE_THROTTLE_MS) return;
    // Claimed before the await, so concurrent requests from the same member
    // do not all decide to write while the first write is still in flight.
    lastWriteByClerkId.set(clerkId, now);

    const userAgent = headers().get("user-agent") ?? "";
    const platform = classifyUserAgent(userAgent);
    const seenAt = new Date(now);

    const update: Record<string, unknown> = {
      lastSeenAt: seenAt,
      lastSeenPlatform: platform,
    };
    if (platform === "ios") update.lastSeenIosAt = seenAt;
    if (platform === "web") update.lastSeenWebAt = seenAt;

    await connectDB();
    await Member.updateOne({ clerkId }, { $set: update });
  } catch (err) {
    // Includes the case where there is no member row yet for this Clerk user,
    // which is normal during onboarding.
    lastWriteByClerkId.delete(clerkId);
    logger.debug({ err }, "Presence stamp skipped");
  }
}

/// Was this member seen on the given platform inside the active window?
export function isActiveNow(seenAt: Date | string | null | undefined): boolean {
  if (!seenAt) return false;
  const time = seenAt instanceof Date ? seenAt.getTime() : Date.parse(String(seenAt));
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= ACTIVE_WINDOW_MS;
}
