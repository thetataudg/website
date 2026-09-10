"use client";

import { useEffect, useState } from "react";

/// Fired by the Requests page after it approves or rejects something, so the
/// badges drop without waiting for a refresh.
export const PENDING_REQUESTS_CHANGED = "pending-requests-changed";

export function announcePendingRequestsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PENDING_REQUESTS_CHANGED));
}

/// How many requests are waiting for an admin. Zero, and no request made,
/// for anyone who isn't an admin.
export function usePendingRequestCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let active = true;
    const load = () => {
      fetch("/api/members/pending/count", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { count: 0 }))
        .then((body) => active && setCount(Number(body?.count) || 0))
        .catch(() => undefined);
    };
    load();
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener(PENDING_REQUESTS_CHANGED, load);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.removeEventListener(PENDING_REQUESTS_CHANGED, load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled]);

  return count;
}
