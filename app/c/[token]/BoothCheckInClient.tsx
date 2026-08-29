"use client";

import { useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_STORE_URL } from "@/lib/appleAppSiteAssociation";

type Result =
  | { kind: "checked-in"; event: string; booth: string }
  | { kind: "already"; event: string; booth: string }
  | { kind: "error"; message: string };

export default function BoothCheckInClient({ token }: { token: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [working, setWorking] = useState(false);
  // React runs effects twice in dev, and this one writes attendance. The
  // endpoint is idempotent, but a doubled request also trips its throttle and
  // the second response would overwrite a good result with a 429.
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    (async () => {
      setWorking(true);
      try {
        const res = await fetch("/api/checkin/booth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setResult({
            kind: "error",
            message: data?.error || "That didn't work. Ask an officer to check you in.",
          });
        } else {
          setResult({
            kind: data.status === "already-checked-in" ? "already" : "checked-in",
            event: data.event?.name || "the event",
            booth: data.booth?.label || "",
          });
        }
      } catch {
        if (!cancelled) {
          setResult({
            kind: "error",
            message: "Couldn't reach the server. Check your connection and tap again.",
          });
        }
      } finally {
        if (!cancelled) setWorking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, token]);

  if (!isLoaded) return <Shell><Spinner label="Loading" /></Shell>;

  // Clerk brings them back to this same URL after sign-in, so the token
  // survives the round trip and the check-in completes on its own.
  if (!isSignedIn) {
    return <RedirectToSignIn redirectUrl={`/c/${token}`} />;
  }

  return (
    <Shell>
      {working || !result ? (
        <Spinner label="Checking you in" />
      ) : result.kind === "error" ? (
        <>
          <TriangleAlert className="h-12 w-12 text-amber-500" aria-hidden />
          <h1 className="text-xl font-semibold">Not checked in</h1>
          <p className="text-sm text-muted-foreground">{result.message}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
          <h1 className="text-xl font-semibold">
            {result.kind === "already" ? "Already checked in" : "You're checked in"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {result.event}
            {result.booth ? ` · ${result.booth}` : ""}
          </p>
        </>
      )}

      <p className="pt-4 text-xs text-muted-foreground">
        On an iPhone?{" "}
        <a className="underline" href={APP_STORE_URL}>
          Get the app
        </a>{" "}
        and tags check you in the moment you tap them.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </>
  );
}
