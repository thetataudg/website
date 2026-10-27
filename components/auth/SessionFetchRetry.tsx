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

/// One refresh for however many requests were refused together, so a page
/// waking up with five calls in flight asks Clerk for one token, not five.
function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const session = (window as any).Clerk?.session;
  if (!session) return Promise.resolve(false);

  refreshing = session
    .getToken({ skipCache: true })
    .then((token: string | null) => Boolean(token))
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing!;
}

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

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOwnApi(input)) return original(input, init);

    // A Request's body can only be read once, so keep a copy for the retry.
    // Retrying is safe even for writes: every route checks auth before it
    // touches anything, so a 401 means nothing happened.
    const retryInput = input instanceof Request ? input.clone() : input;
    const response = await original(input, init);
    if (response.status !== 401) return response;

    if (!(await refreshSession())) return response;
    return original(retryInput, init);
  };
}

// At import, not only in an effect: effects run children first, and a page's
// own first fetch must not slip out before the wrapper is in place.
if (typeof window !== "undefined") install();

export default function SessionFetchRetry() {
  useEffect(install, []);
  return null;
}
