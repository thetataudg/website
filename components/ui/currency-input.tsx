"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Money input with a `$` affix.
 *
 * A flex row that owns the field chrome, rather than an absolutely positioned
 * `$` over a padded `Input`: `cn()` keeps both the Input base's `px-3` and any
 * `pl-*` override, so the affix's clearance would depend on Tailwind's CSS
 * source order and the `$` ends up sitting on the first digit.
 */
const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, disabled, ...props }, ref) => (
  <div
    className={cn(
      "flex h-10 w-full items-center gap-1 rounded-md border border-input bg-background px-3 ring-offset-background",
      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      disabled && "cursor-not-allowed opacity-50",
      className
    )}
  >
    <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
      $
    </span>
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      disabled={disabled}
      className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      {...props}
    />
  </div>
));
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
