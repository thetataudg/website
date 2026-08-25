"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";

type ThemeViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => ThemeViewTransition;
};

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isTransitioningRef = useRef(false);
  const activeAnimationRef = useRef<Animation | null>(null);
  const duration = 400;

  // Avoid hydration mismatch: theme is only known on the client.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const cleanUpTransition = useCallback(() => {
    isTransitioningRef.current = false;
    activeAnimationRef.current?.cancel();
    activeAnimationRef.current = null;

    const root = document.documentElement;
    delete root.dataset.themeTransition;
    root.style.removeProperty("--theme-toggle-transition-duration");
    root.style.removeProperty("--theme-toggle-clip-from");
  }, []);

  useEffect(() => cleanUpTransition, [cleanUpTransition]);

  const toggleTheme = useCallback(() => {
    const next = isDark ? "light" : "dark";
    const button = buttonRef.current;
    const viewTransitionDocument = document as DocumentWithViewTransition;

    // Respect reduced motion / no button / unsupported API → plain switch.
    if (
      !button ||
      prefersReducedMotion() ||
      typeof viewTransitionDocument.startViewTransition !== "function"
    ) {
      setTheme(next);
      return;
    }

    if (
      isTransitioningRef.current ||
      document.documentElement.dataset.themeTransition === "active"
    ) {
      return;
    }

    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxRadius = Math.hypot(
      Math.max(x, viewportWidth - x),
      Math.max(y, viewportHeight - y)
    );

    // Percentages resolve against the View Transition snapshot and stay
    // aligned at fractional browser/display scales where px coordinates can
    // be offset on the first transition.
    const center = `${(x / viewportWidth) * 100}% ${(y / viewportHeight) * 100}%`;
    const radius = `${
      (maxRadius /
        (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) *
      100
    }%`;
    const clipPath = [
      `circle(0% at ${center})`,
      `circle(${radius} at ${center})`,
    ];

    const root = document.documentElement;
    root.dataset.themeTransition = "active";
    root.style.setProperty("--theme-toggle-transition-duration", `${duration}ms`);
    root.style.setProperty("--theme-toggle-clip-from", clipPath[0]);
    isTransitioningRef.current = true;

    try {
      // Keep this as a method call on `document`: detaching the function can
      // throw an "Illegal invocation" in browsers that implement the API.
      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });

      transition.finished.finally(cleanUpTransition).catch(() => {});
      transition.ready
        .then(() => {
          activeAnimationRef.current = root.animate(
            { clipPath },
            {
              duration,
              easing: "ease-in-out",
              fill: "forwards",
              pseudoElement: "::view-transition-new(root)",
            }
          );
        })
        .catch(() => {});
    } catch {
      cleanUpTransition();
      setTheme(next);
    }
  }, [cleanUpTransition, duration, isDark, setTheme]);

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="icon"
      type="button"
      onClick={toggleTheme}
      className="h-9 w-9 shrink-0 p-0"
      title={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} mode`
          : "Toggle theme"
      }
      aria-label={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} mode`
          : "Toggle theme"
      }
    >
      {mounted && isDark ? (
        <Sun aria-hidden="true" className="size-5" />
      ) : (
        <Moon aria-hidden="true" className="size-5" />
      )}
    </Button>
  );
}
