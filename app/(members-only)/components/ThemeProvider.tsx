"use client";

import * as React from "react";

/**
 * Members-only theme provider — class-based, self-contained.
 *
 * Why not `next-themes`? Its `ThemeProvider` breaks `next build`'s
 * "Collecting page data" step under this repo's dual-root-layout architecture
 * (the members layout renders its own nested `<html>`), throwing
 * `PageNotFoundError: /_document`. This provider gives the identical contract
 * (shadcn-compatible `.dark` class + legacy `data-theme` mirror) without that
 * conflict. See docs/MEMBERS_SHADCN_AUDIT.md §"Compatibility decisions".
 *
 * Contract:
 * - Adds/removes `.dark` on <html> for shadcn tokens (theme.css).
 * - Mirrors resolved theme to `data-theme` on `.members-shell` so legacy
 *   members.css `[data-theme]` rules keep working during migration.
 * - Persists preference in localStorage["member-theme"] (same key the old
 *   ThemeToggle used → existing members keep their choice).
 * - Respects OS preference when nothing is stored; updates live in "system".
 * - Blocking inline script prevents a flash of the wrong theme.
 */

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "member-theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Resolved | undefined;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined
);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function systemTheme(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  const shell =
    document.querySelector<HTMLElement>(".members-shell") ?? document.body;
  if (shell) shell.dataset.theme = resolved;
}

/** Runs before paint to set the initial theme (no FOUC). */
const NO_FLASH_SCRIPT = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k);
  var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var r=(s==='light'||s==='dark')?s:(m?'dark':'light');
  var e=document.documentElement;
  if(r==='dark')e.classList.add('dark');else e.classList.remove('dark');
}catch(_){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = React.useState<Resolved>();

  // Read stored preference on mount.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    setThemeState(initial);
    const resolved = initial === "system" ? systemTheme() : initial;
    setResolvedTheme(resolved);
    apply(resolved);
  }, []);

  // React to OS changes while in "system".
  React.useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = systemTheme();
      setResolvedTheme(resolved);
      apply(resolved);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const resolved = next === "system" ? systemTheme() : next;
    setResolvedTheme(resolved);
    apply(resolved);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <script
        dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }}
        suppressHydrationWarning
      />
      {children}
    </ThemeContext.Provider>
  );
}
