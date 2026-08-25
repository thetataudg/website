"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spinner. API is kept identical to the previous Font Awesome implementation
 * (same `size` union) so the existing call sites need no changes.
 * Under `prefers-reduced-motion` the spin slows rather than stopping, so the
 * control still reads as "busy".
 */
const SIZE_CLASS: Record<string, string> = {
  xs: "size-3",
  sm: "size-4",
  lg: "size-5",
  xl: "size-6",
  "2x": "size-8",
};

export function LoadingSpinner({
  className = "",
  size = "lg",
}: {
  className?: string;
  size?: "xs" | "sm" | "lg" | "xl" | "2x";
}) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn(
        "animate-spin text-primary motion-reduce:[animation-duration:2s]",
        SIZE_CLASS[size] ?? SIZE_CLASS.lg,
        className
      )}
    />
  );
}

/**
 * Full-page branded loading state: a ΔΓ monogram inside a rotating brand arc,
 * with a soft echo ring. Motion is disabled/slowed under
 * `prefers-reduced-motion`; the text alone still communicates the state.
 */
export default function LoadingState({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    // Centred in the viewport below the 3.5rem navbar. All sizing is fluid
    // (clamp on vmin/vw) so the mark scales with the screen instead of
    // stepping at breakpoints.
    <div
      className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-[clamp(1.5rem,4vh,3rem)] px-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative flex aspect-square w-[clamp(7rem,22vmin,16rem)] items-center justify-center">
        {/* Soft echo ring — decorative */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping"
        />
        {/* Rotating brand arc */}
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full border-[3px] border-border border-r-primary border-t-primary [animation-duration:1.1s] motion-reduce:[animation-duration:3s]"
        />
        {/* Monogram */}
        <span
          aria-hidden="true"
          className="relative font-semibold tracking-tight text-primary [font-size:clamp(1.75rem,7vmin,4rem)]"
        >
          ΔΓ
        </span>
      </div>

      <div className="space-y-2 text-center">
        <p className="font-medium text-foreground [font-size:clamp(1rem,2.4vmin,1.5rem)]">
          {message}
        </p>
        <p className="text-muted-foreground [font-size:clamp(0.75rem,1.6vmin,1rem)]">
          Delta Gamma Chapter Tools
        </p>
      </div>
    </div>
  );
}
