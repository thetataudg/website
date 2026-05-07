"use client";

import { useEffect, useState } from "react";
import LoadingState from "./LoadingState";
import MembershipRevokedState from "./MembershipRevokedState";

export default function MembersOnlyAccessGate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isChecking, setIsChecking] = useState(true);
  const [isRemoved, setIsRemoved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadMemberStatus = async () => {
      try {
        const response = await fetch("/api/members/me", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const member = await response.json();
        if (cancelled) return;

        setIsRemoved(String(member?.status || "").toLowerCase() === "removed");
      } catch (error) {
        console.error("Members-only access gate failed", error);
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    loadMemberStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isChecking) {
    return <LoadingState message="Checking account status..." />;
  }

  if (isRemoved) {
    return <MembershipRevokedState />;
  }

  return <>{children}</>;
}