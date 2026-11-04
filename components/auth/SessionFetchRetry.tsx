"use client";

import { useEffect } from "react";

/**
 * Retries a refused `/api/*` call once, after Clerk has refreshed the session.
 *
 * The session cookie the server checks lives for sixty seconds, and Clerk's
 * browser SDK keeps it fresh on a timer. A tab that slept (a closed laptop, a
 * background tab Chrome throttled) wakes up holding an expired cookie, and
 * whatever the page fetches first races the refresh and loses: the server
 * answers 401 to a member who is plainly signed in. Sentry showed exactly
 * that, a Clerk token refresh and a pair of 401s in the same second.
 *
 * The iOS app has always retried a 401 with a fresh token; this is the same
 * rule for the website, applied once to every same-origin API call rather
 * than at each of the hundreds of `fetch` sites.
 */

let installed = false;
let refreshing: Promise<boolean> | null = null;

/// The unexpired-cookie margin below which a call waits for a new token
/// rather than going out with one that will be dead by the time it arrives.
const EXPIRY_MARGIN_MS = 8_000;
/// How long to wait for Clerk to write the new token into the cookie after
/// `getToken` resolves. Normally immediate; the bound only stops a stuck
/// cookie from holding every request.
const COOKIE_SETTLE_MS = 1_500;

/// The session cookie as the browser holds it, or "" when it has lapsed.
/// `__session` is readable from script by design (Clerk sets it that way so
/// the SDK can see it), and it is the very value the server will check.
function sessionCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)__session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/// Milliseconds until the cookie's JWT expires. Negative once past, and
/// negative infinity with no cookie at all, since a missing cookie is what an
/// expired one becomes when the browser drops it at its own max-age.
function cookieTtl(): number {
  const token = sessionCookie();
  if (!token) return -Infinity;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 - Date.now() : Infinity;
  } catch {
    return Infinity;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// `getToken` resolving does not by itself mean the cookie has the new value:
/// Clerk writes it from a token-update event. Going out in the gap is how a
/// retry came back 401 a second time, so wait until the cookie is the token
/// we were just handed.
async function waitForCookie(token: string) {
  const deadline = Date.now() + COOKIE_SETTLE_MS;
  while (sessionCookie() !== token && Date.now() < deadline) await sleep(25);
}

/// One refresh for however many requests were refused together, so a page
/// waking up with five calls in flight asks Clerk for one token, not five.
function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const session = (window as any).Clerk?.session;
  if (!session) return Promise.resolve(false);

  refreshing = session
    .getToken({ skipCache: true })
    .then(async (token: string | null) => {
      if (!token) return false;
      await waitForCookie(token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing!;
}

/// Before a call leaves, make sure the cookie it will carry is alive. This is
/// the real fix for the mail client: the first thing a woken tab does is open
/// a message, and that fetch used to go out on a cookie that had lapsed while
/// the tab slept, 401, and only then refresh. Refreshing first means the
/// common case never sees a 401 at all, and a call that starts while another
/// is already refreshing waits for it instead of racing it.
async function ensureFreshSession() {
  if (refreshing) {
    await refreshing;
    return;
  }
  if (!(window as any).Clerk?.session) return;
  // At most once per window: if the cookie still reads as stale right after a
  // refresh (a browser that hides it, a renamed cookie), every call would
  // otherwise pay for a refresh and the settle wait. The 401 retry still
  // covers that case.
  if (Date.now() - lastPreflight < PREFLIGHT_COOLDOWN_MS) return;
  if (cookieTtl() < EXPIRY_MARGIN_MS) {
    lastPreflight = Date.now();
    await refreshSession();
  }
}

let lastPreflight = 0;
const PREFLIGHT_COOLDOWN_MS = 10_000;

function isOwnApi(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function install() {
  if (installed) return;
  installed = true;
  refreshOnWake();

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOwnApi(input)) return original(input, init);

    // A Request's body can only be read once, so keep a copy for the retry.
    // Retrying is safe even for writes: every route checks auth before it
    // touches anything, so a 401 means nothing happened.
    const retryInput = input instanceof Request ? input.clone() : input;
    await ensureFreshSession();
    const response = await original(input, init);
    if (response.status !== 401) return response;

    // Once, never in a loop: if a brand-new token is refused too, the member
    // really is signed out and the caller should hear about it.
    if (!(await refreshSession())) return response;
    return original(retryInput, init);
  };
}

// A tab coming back to the front is the moment the cookie is most likely to
// have lapsed. Refresh then, so the calls the page makes on waking (the open
// message, the badge, the list) find a live cookie instead of racing for one.
function refreshOnWake() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cookieTtl() < EXPIRY_MARGIN_MS) {
      void refreshSession();
    }
  });
}

// At import, not only in an effect: effects run children first, and a page's
// own first fetch must not slip out before the wrapper is in place.
if (typeof window !== "undefined") install();

export default function SessionFetchRetry() {
  useEffect(install, []);
  return null;
}
