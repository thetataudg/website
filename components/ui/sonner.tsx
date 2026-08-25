"use client";

import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

import { useTheme } from "@/app/(members-only)/components/ThemeProvider";

/**
 * The app's toaster.
 *
 * shadcn's toast, wired to the members' area theme provider rather than
 * `next-themes` — this app has its own, and a toaster stuck in light mode on a
 * dark page is worse than no toast at all.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme ?? "light") as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { toast };
