// components/auth/revokeNotice.ts
// "Why was I suddenly signed out?", shared by the two places that can answer.
//
// The question can only be asked after the session is gone, when the browser
// has nothing identifying left to send — so the Clerk id is parked while the
// member is still signed in and read once on the way out.
//
// Two consumers, deliberately: the members-area gate catches a member who was
// sitting on a page when an admin revoked them, and the sign-in page catches
// one who arrives there directly. The note is acknowledged as soon as either
// shows it, so whichever comes first wins and it appears exactly once.

import { useCallback, useEffect, useState } from "react";

const LAST_CLERK_ID_KEY = "ttdg:last-clerk-id";

export type RevokeNotice = { sessionId: string; deviceLabel: string };

/// localStorage throws in private windows and with site data blocked, and a
/// courtesy message is never worth a blank page.
export function readStoredClerkId(): string {
  try {
    return window.localStorage.getItem(LAST_CLERK_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredClerkId(value: string) {
  try {
    if (value) window.localStorage.setItem(LAST_CLERK_ID_KEY, value);
    else window.localStorage.removeItem(LAST_CLERK_ID_KEY);
  } catch {
    // Nothing to do: the member simply gets the ordinary sign-in prompt.
  }
}

/// Looks up whether an admin ended this browser's last session.
///
/// `enabled` is the caller's "we are signed out and it is worth asking" — the
/// gate only asks once Clerk has resolved, and the sign-in page always asks.
/// `checked` reports that the lookup has finished, so a caller can hold off a
/// redirect rather than bouncing away before the answer arrives.
///
/// `acknowledge` marks the note delivered. Only the screen that actually shows
/// the message may do that: the gate looks the note up to decide which
/// `?logout=` reason to redirect with, and if it acknowledged on the way past,
/// the sign-in page would find nothing left to explain.
export function useRevokeNotice(
  enabled: boolean,
  { acknowledge = true }: { acknowledge?: boolean } = {}
) {
  const [notice, setNotice] = useState<RevokeNotice | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const clerkId = readStoredClerkId();
    if (!clerkId) {
      setChecked(true);
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `/api/session-revoked?clerkId=${encodeURIComponent(clerkId)}`,
          { cache: "no-store" }
        );
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (payload?.revoked) {
          setNotice({
            sessionId: String(payload.sessionId ?? ""),
            deviceLabel: String(payload.deviceLabel ?? ""),
          });
          // Acknowledged on display rather than on dismissal: the member's
          // next act is to sign in, and there is no dismissal to wait for.
          if (acknowledge && payload.sessionId) {
            fetch("/api/session-revoked", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: payload.sessionId }),
            }).catch(() => {});
            writeStoredClerkId("");
          }
        }
      } catch {
        // Fall through to the ordinary sign-in prompt.
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, acknowledge]);

  const dismiss = useCallback(() => setNotice(null), []);

  return { notice, checked, dismiss };
}
