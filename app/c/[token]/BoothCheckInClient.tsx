"use client";

import { useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { APP_STORE_URL } from "@/lib/appleAppSiteAssociation";

// Deliberately no `Card`, `Button`, or `text-muted-foreground` here, though an
// earlier version of this page used all three.
//
// Those are shadcn utilities, and their CSS variables are declared on
// `.members-shell` in app/(members-only)/theme.css. This route sits outside
// `(members-only)` on purpose — it has to answer for signed-out members and for
// Android — so none of those variables are in scope, every token resolved to
// nothing, and the page rendered as an unstyled box with a hairline border.
// Everything below is either a literal colour or one of the two brand colours
// declared globally in tailwind.config.ts.

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

  if (!isLoaded) {
    return (
      <Shell>
        <Spinner label="Loading" />
      </Shell>
    );
  }

  // Clerk brings them back to this same URL after sign-in, so the token
  // survives the round trip and the check-in completes on its own.
  if (!isSignedIn) {
    return <RedirectToSignIn redirectUrl={`/c/${token}`} />;
  }

  if (working || !result) {
    return (
      <Shell>
        <Spinner label="Checking you in" />
      </Shell>
    );
  }

  if (result.kind === "error") {
    return (
      <Shell>
        <Badge tone="warning">
          <TriangleAlert className="h-7 w-7" strokeWidth={2.25} aria-hidden />
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Not checked in
        </h1>
        <p className="max-w-[34ch] text-[15px] leading-relaxed text-neutral-500">
          {result.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-full bg-tt-dark-red px-6 py-2.5 text-sm font-semibold text-white
                     transition-transform active:scale-[0.97] hover:bg-[#8f1f27]
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-tt-dark-red"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const isNew = result.kind === "checked-in";

  return (
    <Shell>
      <Badge tone={isNew ? "success" : "neutral"}>
        <Check className="h-8 w-8" strokeWidth={2.75} aria-hidden />
      </Badge>

      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        {isNew ? "You're checked in" : "Already checked in"}
      </h1>

      <p className="text-[17px] font-medium text-neutral-800">{result.event}</p>

      {result.booth ? (
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium tracking-wide text-neutral-600">
          {result.booth}
        </span>
      ) : null}

      {!isNew ? (
        <p className="text-[15px] leading-relaxed text-neutral-500">
          Your attendance was already recorded. Nothing else to do.
        </p>
      ) : null}
    </Shell>
  );
}

/// The chapter frame every state sits in: a lifted white card on a faint
/// crimson wash, so the page reads as the chapter's rather than as a default
/// browser page.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-[#faf7f7] to-[#f3eeee] p-6">
      <div
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] bg-white px-8 py-10
                   text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-8px_rgba(122,1,4,0.13)]
                   ring-1 ring-black/[0.06]"
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-tt-dark-red">
          Theta Tau · Delta Gamma
        </p>
        {children}
      </div>

      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-neutral-500">
        On an iPhone?{" "}
        <a
          className="font-medium text-tt-dark-red underline underline-offset-2 hover:no-underline"
          href={APP_STORE_URL}
        >
          Get the app
        </a>{" "}
        and tags check you in the moment you tap them.
      </p>
    </main>
  );
}

/// A tinted disc behind a borderless glyph. The ring is the badge, drawn once
/// here, rather than baked into every icon as a `*-circle` variant.
function Badge({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    success: "bg-emerald-50 text-emerald-600",
    neutral: "bg-neutral-100 text-neutral-500",
    warning: "bg-amber-50 text-amber-600",
  } as const;

  return (
    <div
      className={`mb-1 flex h-16 w-16 items-center justify-center rounded-full ${tones[tone]}`}
      aria-hidden
    >
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <div className="mb-1 flex h-16 w-16 items-center justify-center" aria-hidden>
        <Loader2 className="h-9 w-9 animate-spin text-tt-dark-red/40" strokeWidth={2.25} />
      </div>
      <p className="text-[15px] text-neutral-500">{label}…</p>
    </>
  );
}
