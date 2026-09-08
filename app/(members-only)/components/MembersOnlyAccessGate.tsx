"use client";

import { useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import LoadingState from "./LoadingState";
import MembershipRevokedState from "./MembershipRevokedState";
import SessionRevokedState from "./SessionRevokedState";

/// Where the last signed-in Clerk id is parked.
///
/// Needed because the question "why was I signed out?" can only be asked after
/// the session is gone, when the browser no longer has anything identifying to
/// send. Written while signed in, read once on the way out.
const LAST_CLERK_ID_KEY = "ttdg:last-clerk-id";

type RevokeNotice = { sessionId: string; deviceLabel: string };

/// localStorage throws in private windows and with site data blocked, and a
/// courtesy message is never worth a blank page.
function readStoredClerkId(): string {
  try {
    return window.localStorage.getItem(LAST_CLERK_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredClerkId(value: string) {
  try {
    if (value) window.localStorage.setItem(LAST_CLERK_ID_KEY, value);
    else window.localStorage.removeItem(LAST_CLERK_ID_KEY);
  } catch {
    // Nothing to do: the member simply gets the ordinary sign-in prompt.
  }
}

export default function MembersOnlyAccessGate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [isRemoved, setIsRemoved] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<RevokeNotice | null>(null);
  const [checkedRevoke, setCheckedRevoke] = useState(false);

  // Remember who this is while there is still a session to read it from.
  useEffect(() => {
    if (isSignedIn && userId) writeStoredClerkId(userId);
  }, [isSignedIn, userId]);

  // Signed out: find out whether an admin did it, before bouncing to sign-in.
  useEffect(() => {
    if (!isLoaded || isSignedIn) return;

    let cancelled = false;
    const clerkId = readStoredClerkId();
    if (!clerkId) {
      setCheckedRevoke(true);
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
          setRevokeNotice({
            sessionId: String(payload.sessionId ?? ""),
            deviceLabel: String(payload.deviceLabel ?? ""),
          });
          // Shown once. Acknowledged as soon as it is displayed rather than on
          // dismissal, because the member's next act is to leave for the sign-in
          // page and there is no dismissal to wait for.
          if (payload.sessionId) {
            fetch("/api/session-revoked", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: payload.sessionId }),
            }).catch(() => {});
          }
          writeStoredClerkId("");
        }
      } catch {
        // Fall through to the ordinary sign-in redirect.
      } finally {
        if (!cancelled) setCheckedRevoke(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // Membership status only matters for someone who is actually signed in.
  // Asking for it while signed out is what produced a pair of 401s and a
  // dashboard that span forever behind them.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/members/me", { cache: "no-store" });
        if (!response.ok) return;

        const member = await response.json();
        if (cancelled) return;

        setIsRemoved(String(member?.status || "").toLowerCase() === "removed");
      } catch (error) {
        console.error("Members-only access gate failed", error);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || isChecking) {
    return <LoadingState message="Checking access..." />;
  }

  // Signed out, and the gate answers for the whole area. Pages below still
  // carry their own `RedirectToSignIn`, but they never get the chance to
  // render their own loading state first — which is why a signed-out visitor
  // to /member used to sit on "Loading dashboard..." indefinitely.
  if (!isSignedIn) {
    if (!checkedRevoke) {
      return <LoadingState message="Checking access..." />;
    }
    if (revokeNotice) {
      return <SessionRevokedState deviceLabel={revokeNotice.deviceLabel} />;
    }
    return <RedirectToSignIn />;
  }

  if (isRemoved) {
    return <MembershipRevokedState />;
  }

  return <>{children}</>;
}
