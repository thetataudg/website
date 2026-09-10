"use client";

import { useCallback, useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import LoadingState from "../../components/LoadingState";
import { Toaster } from "@/components/ui/sonner";
import Onboarding from "./components/Onboarding";
import MailApp from "./components/MailApp";
import type { AccountPayload } from "./components/types";

/// Chapter Mail: the request flow until the member has a mailbox, then the
/// mailbox itself.
export default function MailPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/account", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load Chapter Mail.");
      setData(body);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) void load();
  }, [isSignedIn, load]);

  if (!isLoaded) return <LoadingState />;
  if (!isSignedIn) return <RedirectToSignIn />;

  return (
    <>
      <Toaster />
      {error ? (
        <p className="px-4 py-20 text-center text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        <LoadingState />
      ) : data.account?.status === "active" && data.eligible ? (
        <MailApp data={data} />
      ) : (
        <Onboarding data={data} onChange={load} />
      )}
    </>
  );
}
