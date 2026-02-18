"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { flushSync } from "react-dom";

const STORAGE_KEY = "member-theme";

type ThemeMode = "light" | "dark";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const duration = 400;

  useEffect(() => {
    const initial = resolveInitialTheme();
    setTheme(initial);
    document.body.dataset.theme = initial;
  }, []);

  const applyTheme = useCallback((next: ThemeMode) => {
    setTheme(next);
    document.body.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const runCircularReveal = useCallback(
    (x: number, y: number, useViewTransitionLayer: boolean) => {
      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      const keyframes = {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      };

      try {
        if (useViewTransitionLayer) {
          document.documentElement.animate(keyframes, {
            duration,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          });
          return;
        }
        document.documentElement.animate(keyframes, {
          duration,
          easing: "ease-in-out",
        });
      } catch {
        document.body.animate(keyframes, {
          duration,
          easing: "ease-in-out",
        });
      }
    },
    [duration]
  );

  const toggleTheme = useCallback(async () => {
    const next = theme === "dark" ? "light" : "dark";
    const button = buttonRef.current;
    const startViewTransition = (document as any).startViewTransition as
      | ((callback: () => void) => { ready: Promise<void> })
      | undefined;

    if (!button) {
      applyTheme(next);
      return;
    }

    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;

    if (typeof startViewTransition !== "function") {
      applyTheme(next);
      runCircularReveal(x, y, false);
      return;
    }

    try {
      const transition = startViewTransition(() => {
        flushSync(() => {
          applyTheme(next);
        });
      });

      await transition.ready;

      runCircularReveal(x, y, true);
    } catch (error) {
      applyTheme(next);
      runCircularReveal(x, y, false);
    }
  }, [theme, applyTheme, runCircularReveal]);

  return (
    <button
      ref={buttonRef}
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      data-theme={theme}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
      </span>
      <span className="theme-toggle__label">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
