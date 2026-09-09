"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import LoadingState from "./LoadingState";
import MembershipRevokedState from "./MembershipRevokedState";
import {
  useRevokeNotice,
  writeStoredClerkId,
} from "@/components/auth/revokeNotice";

export default function MembersOnlyAccessGate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isRemoved, setIsRemoved] = useState(false);
  // Only worth asking once Clerk has resolved and says we are signed out. The
  // note is consumed here: all it decides is which `?logout=` reason to
  // redirect with, and the message on the sign-in page comes from the URL.
  const { notice: revokeNotice, checked: checkedRevoke } = useRevokeNotice(
    isLoaded && !isSignedIn
  );

  // Remember who this is while there is still a session to read it from.
  useEffect(() => {
    if (isSignedIn && userId) writeStoredClerkId(userId);
  }, [isSignedIn, userId]);

  // Signed out: leave for the sign-in page, saying why. `?logout=` is how
  // that page decides which message to show; `session-revoked` only when the
  // server actually has a note, so an ordinary expiry is not mislabelled as an
  // admin action.
  useEffect(() => {
    if (!isLoaded || isSignedIn || !checkedRevoke) return;
    const reason = revokeNotice ? "session-revoked" : "session-expired";
    router.replace(`/sign-in?logout=${reason}`);
  }, [isLoaded, isSignedIn, checkedRevoke, revokeNotice, router]);

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
    // Held until the lookup finishes so the redirect can carry the right
    // reason. Bouncing first and explaining never is the behaviour this whole
    // path exists to avoid.
    if (!checkedRevoke) {
      return <LoadingState message="Checking access..." />;
    }
    return <LoadingState message="Redirecting to sign in..." />;
  }

  if (isRemoved) {
    return <MembershipRevokedState />;
  }

  return <>{children}</>;
}
