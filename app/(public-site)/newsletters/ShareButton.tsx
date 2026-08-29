"use client";

import { useEffect, useState } from "react";

/**
 * Copy this page's link.
 *
 * Deliberately the clipboard and nothing else. `navigator.share` opens the
 * system sheet on a phone and does nothing at all on most desktop browsers, so
 * the same button behaved differently depending on where it was pressed and
 * there was no way to tell from looking at it.
 *
 * The confirmation is animated because a copy leaves no other trace: nothing
 * on screen changes, no sheet opens, and a label that silently swaps to "Link
 * copied" is easy to miss when your eyes are on the address bar. The icon
 * crossfades into a tick, the button pulses once, and it settles back after a
 * couple of seconds.
 */
export default function ShareButton({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      // Blocked, or an insecure origin.
      setState("failed");
    }
  }

  const copied = state === "copied";

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-2 rounded-full border border-current px-4 py-2 text-sm font-medium transition-transform duration-200 hover:opacity-70 ${
        copied ? "scale-[1.04]" : "scale-100"
      } ${className}`}
    >
      {/* Both icons occupy the same cell and crossfade, so the label does not
          shift sideways as they swap. */}
      <span className="relative inline-block size-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        >
          <path d="m20 6-11 11-5-5" />
        </svg>
      </span>
      {state === "copied"
        ? "Link copied"
        : state === "failed"
          ? "Couldn't copy"
          : "Copy link"}
      {/* Announced rather than only drawn: the animation is the only
          confirmation, and a screen reader user gets none of it. */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </button>
  );
}
