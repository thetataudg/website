"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/// Copy the public link, and show that it happened.
///
/// One component because three screens needed the same three lines and the
/// same caveat: a draft has no public link yet, so the control says that
/// rather than handing over a URL that answers 404.
///
/// The tick and the pulse are the point. A copy changes nothing on screen, and
/// a toast alone is easy to miss when the pointer is already moving toward the
/// address bar.
export default function CopyLinkButton({
  url,
  disabled = false,
  size = "sm",
  variant = "ghost",
}: {
  url: string;
  disabled?: boolean;
  size?: "sm" | "default";
  variant?: "ghost" | "outline";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (disabled) {
      toast.info("Publish it first, then this link works for anyone.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={copy}
      className={`transition-transform duration-200 ${copied ? "scale-[1.04]" : "scale-100"}`}
    >
      {/* One cell, two icons, so the label holds still while they swap. */}
      <span className="relative mr-1.5 inline-block size-3.5">
        <Link2
          aria-hidden="true"
          className={`absolute inset-0 size-3.5 transition-all duration-200 ${
            copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
          }`}
        />
        <Check
          aria-hidden="true"
          className={`absolute inset-0 size-3.5 transition-all duration-200 ${
            copied ? "scale-100 opacity-100 text-green-600 dark:text-green-500" : "scale-50 opacity-0"
          }`}
        />
      </span>
      {copied ? "Copied" : "Copy link"}
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </Button>
  );
}
