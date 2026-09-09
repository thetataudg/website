"use client";

// Copies the poll's pretty link to the clipboard. Heads paste it into Discord.
import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SharePollButton({
  sharePath,
  size = "sm",
  variant = "outline",
}: {
  /// "/member/<committee>/poll/<slug>" — server-built.
  sharePath: string | null | undefined;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
}) {
  const [copied, setCopied] = React.useState(false);
  if (!sharePath) return null;

  const copy = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${sharePath}`
        : sharePath;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={copy}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      Share
    </Button>
  );
}
