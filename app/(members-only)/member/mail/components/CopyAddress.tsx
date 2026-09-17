"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

import { cn } from "@/lib/utils";

/// The mailbox address at the top of the sidebar. Hovering turns the envelope
/// into a copy glyph; clicking copies the address and settles on a checkmark
/// for a moment before going back.
export default function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Older Safari without clipboard permission: fall back to a selection.
      const field = document.createElement("textarea");
      field.value = address;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  // Three glyphs stacked in one box, crossfading with a small scale and blur,
  // so the swap reads as one icon changing rather than two swapping places.
  const glyph = "absolute inset-0 size-4 transition-all duration-200 ease-out motion-reduce:transition-none";
  const hidden = "scale-50 opacity-0 blur-[2px]";
  const shown = "scale-100 opacity-100 blur-0";

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      title={copied ? "Copied" : "Copy address"}
      aria-label={copied ? `Copied ${address}` : `Copy ${address}`}
    >
      <span className="relative size-4 shrink-0">
        <Mail
          className={cn(glyph, copied ? hidden : cn(shown, "group-hover:scale-50 group-hover:opacity-0 group-hover:blur-[2px] group-focus-visible:scale-50 group-focus-visible:opacity-0"))}
          aria-hidden="true"
        />
        <Copy
          className={cn(glyph, copied ? hidden : cn(hidden, "group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:blur-0"))}
          aria-hidden="true"
        />
        <Check
          className={cn(
            glyph,
            "text-emerald-600 dark:text-emerald-400",
            copied ? cn(shown, "duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]") : hidden
          )}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </span>
      <span className="relative min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium transition-all duration-200",
            copied && "-translate-y-1 opacity-0"
          )}
        >
          {address}
        </span>
        <span
          className={cn(
            "absolute inset-0 truncate text-sm font-medium text-emerald-600 transition-all duration-200 dark:text-emerald-400",
            copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          )}
          aria-hidden="true"
        >
          Copied to clipboard
        </span>
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Address copied" : ""}
      </span>
    </button>
  );
}
