// lib/clerkSessions.ts
// Who is signed in right now, on what, read from Clerk.
//
// Clerk is the system of record for sessions, so the admin console reads it
// directly rather than keeping a shadow copy that could disagree. Two things
// about its Backend API shape this file:
//
//  1. A session list must name a `user_id` or a `client_id`. Asking for every
//     active session at once is a 422 (`form_param_missing`), so there is no
//     one-shot chapter-wide query — the list has to be assembled per user.
//  2. Sessions are only reachable through users, so the cost is bounded by
//     narrowing the user list first. Users come back sortable by
//     `last_active_at`, and a session cannot be active if its user has not
//     been active inside the session lifetime, so everyone quieter than the
//     lookback is skipped without a request.
//
// The Node SDK is not used here: its `Session` type drops `latest_activity`,
// which is the only field that says whether a session is a phone or a laptop.
import logger from "@/lib/logger";

const CLERK_API = "https://api.clerk.com/v1";

/// How far back to look for users who might still hold a session.
///
/// Clerk's default session lifetime is seven days; a user idle longer than
/// that cannot have an active session, so fetching their sessions is a
/// guaranteed empty answer. Padded by a day because the lifetime is a Clerk
/// setting and this file should not silently miss sessions if it is raised.
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;

/// Users fetched per page, and the ceiling on how many are considered.
///
/// A chapter is a few hundred people and only the recently-active ones are
/// examined, so this ceiling is generous. It exists so an unexpected instance
/// (or a misconfigured lifetime) cannot turn one page load into thousands of
/// API calls.
const USER_PAGE_SIZE = 100;
const MAX_USERS_SCANNED = 500;

/// Concurrent session lookups. Clerk rate-limits per instance; this keeps a
/// refresh quick without risking 429s on a busy chapter.
const CONCURRENCY = 8;

export type SessionPlatform = "ios" | "web" | "unknown";

export type ActiveSession = {
  sessionId: string;
  clerkId: string;
  status: string;
  platform: SessionPlatform;
  /// Human label for the row: "iPhone app 1.4", "Chrome on macOS".
  deviceLabel: string;
  deviceType: string;
  isMobile: boolean;
  browserName: string;
  browserVersion: string;
  ipAddress: string;
  location: string;
  lastActiveAt: string | null;
  expireAt: string | null;
  createdAt: string | null;
};

async function clerkFetch(path: string, init?: RequestInit) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");

  return fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

/// Clerk labels a session with whatever product token the client's user agent
/// led with, so the native app shows up under `browser_name` as the bundle
/// name — "Theta%20Tau", exactly as the Clerk dashboard renders it.
///
/// Matching on "not a known browser" rather than on the app's name: the app's
/// display name is far more likely to change than Safari's is, and a session
/// against our own instance that is not a browser is one of our own clients.
const KNOWN_BROWSERS =
  /^(chrome|safari|mobile safari|firefox|edge|edg|opera|samsung|brave|chromium|internet explorer|webkit)/i;

/// The Clerk iOS SDK's own label, sent by `TTDGUserAgentMiddleware` in the app.
const APP_LABEL = /TTDG-Mobile-App|CFNetwork/i;

export function classifyActivity(activity: any): SessionPlatform {
  const browser = decodeLabel(String(activity?.browser_name ?? ""));
  const device = String(activity?.device_type ?? "");

  if (APP_LABEL.test(browser)) return "ios";
  if (!browser) return "unknown";
  if (KNOWN_BROWSERS.test(browser)) return "web";
  // A named client that is not a browser is the native app. Clerk reports no
  // device type at all for it, which is the other half of the signature.
  if (!device) return "ios";
  return "web";
}

export function describeActivity(
  activity: any,
  platform: SessionPlatform
): string {
  const browser = decodeLabel(String(activity?.browser_name ?? ""));
  const version = String(activity?.browser_version ?? "");
  const device = String(activity?.device_type ?? "");

  if (platform === "ios") {
    // The version Clerk holds for the app is its build number, which is more
    // useful to an admin than the bundle name they already know.
    return version ? `iPhone app (build ${version})` : "iPhone app";
  }
  if (!browser) return device || "Unknown device";
  const shortVersion = version.split(".")[0];
  const named = shortVersion ? `${browser} ${shortVersion}` : browser;
  return device ? `${named} on ${device}` : named;
}

function decodeLabel(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is not worth failing a read-only listing over.
    return value;
  }
}

function toIso(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSession(session: any): ActiveSession {
  const activity = session?.latest_activity ?? {};
  const platform = classifyActivity(activity);
  const city = String(activity?.city ?? "");
  const country = String(activity?.country ?? "");

  return {
    sessionId: String(session?.id ?? ""),
    clerkId: String(session?.user_id ?? ""),
    status: String(session?.status ?? ""),
    platform,
    deviceLabel: describeActivity(activity, platform),
    deviceType: String(activity?.device_type ?? ""),
    isMobile: Boolean(activity?.is_mobile),
    browserName: decodeLabel(String(activity?.browser_name ?? "")),
    browserVersion: String(activity?.browser_version ?? ""),
    ipAddress: String(activity?.ip_address ?? ""),
    location: [city, country].filter(Boolean).join(", "),
    lastActiveAt: toIso(session?.last_active_at),
    expireAt: toIso(session?.expire_at),
    createdAt: toIso(session?.created_at),
  };
}

/// Clerk users who have been active recently enough to still hold a session.
async function recentlyActiveUserIds(): Promise<string[]> {
  const ids: string[] = [];
  const cutoff = Date.now() - LOOKBACK_MS;

  for (let offset = 0; offset < MAX_USERS_SCANNED; offset += USER_PAGE_SIZE) {
    const response = await clerkFetch(
      `/users?limit=${USER_PAGE_SIZE}&offset=${offset}&order_by=-last_active_at`
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Clerk user list failed (${response.status}): ${body.slice(0, 200)}`
      );
    }

    const payload = await response.json();
    const users: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      const lastActive = Number(user?.last_active_at ?? 0);
      // Sorted descending, so the first user past the cutoff ends the walk —
      // everyone after them is quieter still.
      if (lastActive && lastActive < cutoff) return ids;
      if (user?.id) ids.push(String(user.id));
    }

    if (users.length < USER_PAGE_SIZE) break;
  }

  return ids;
}

async function sessionsForUser(clerkId: string): Promise<ActiveSession[]> {
  const response = await clerkFetch(
    `/sessions?user_id=${encodeURIComponent(clerkId)}&status=active&limit=25`
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn(
      { clerkId, status: response.status, body: body.slice(0, 200) },
      "Clerk session list failed for user"
    );
    // One member's sessions failing must not blank the whole console.
    return [];
  }

  const payload = await response.json();
  const sessions: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
  return sessions.map(toSession).filter((session) => session.sessionId);
}

/// Every active session on the instance, newest activity first.
export async function listActiveSessions(): Promise<ActiveSession[]> {
  const userIds = await recentlyActiveUserIds();
  const results: ActiveSession[] = [];

  // A fixed pool rather than `Promise.all` over every user at once: the point
  // of the concurrency limit is that it holds however long the candidate list
  // turns out to be.
  let cursor = 0;
  async function worker() {
    while (cursor < userIds.length) {
      const index = cursor++;
      results.push(...(await sessionsForUser(userIds[index])));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, userIds.length) }, worker)
  );

  results.sort((a, b) => {
    const left = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
    const right = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
    return right - left;
  });

  return results;
}

/// Sign one device out. Clerk ends the session immediately; the client
/// discovers it on its next token refresh, within about a minute.
export async function revokeSession(sessionId: string): Promise<void> {
  const response = await clerkFetch(
    `/sessions/${encodeURIComponent(sessionId)}/revoke`,
    { method: "POST" }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Clerk session revoke failed (${response.status}): ${body.slice(0, 200)}`
    );
  }
}
