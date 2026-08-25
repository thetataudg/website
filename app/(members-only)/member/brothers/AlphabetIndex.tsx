// app/(members-only)/member/brothers/AlphabetIndex.tsx
"use client";

import { cn } from "@/lib/utils";

export const LETTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  "#",
] as const;

export type IndexLetter = (typeof LETTERS)[number];

/** DOM id for a letter section heading, shared by the rail and the list. */
export const letterSectionId = (letter: string) =>
  `brothers-letter-${letter === "#" ? "other" : letter}`;

/**
 * Alphabet jump index. Rendered twice by the directory:
 *  - a sticky vertical rail beside the grid from `sm` up
 *  - a horizontally scrollable strip on mobile, where a 27-item vertical rail
 *    would not fit and its targets would be far under 44px
 * Letters with no members stay visible (so positions never shift) but are
 * disabled rather than silently inert.
 */
export default function AlphabetIndex({
  available,
  onJump,
  variant,
  className,
}: {
  available: Set<string>;
  onJump: (letter: string) => void;
  variant: "rail" | "strip";
  className?: string;
}) {
  const isRail = variant === "rail";

  return (
    <nav
      aria-label="Jump to a letter"
      className={cn(
        isRail
          ? "flex flex-col items-center gap-px"
          : "flex gap-1 overflow-x-auto pb-1",
        className
      )}
    >
      {LETTERS.map((letter) => {
        const enabled = available.has(letter);
        return (
          <button
            key={letter}
            type="button"
            disabled={!enabled}
            onClick={() => onJump(letter)}
            aria-label={
              letter === "#"
                ? "Jump to names starting with a number or symbol"
                : `Jump to ${letter}`
            }
            className={cn(
              "rounded-md font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              enabled
                ? "text-primary hover:bg-accent hover:text-accent-foreground"
                : "cursor-default text-muted-foreground/40",
              isRail
                ? "flex h-5 w-5 items-center justify-center text-[11px] leading-none"
                : "size-11 shrink-0 text-sm"
            )}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
