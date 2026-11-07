"use client";

// Stale-while-revalidate for the member tools. A page renders the last copy
// it saw (memory first, then localStorage) straight away, refetches in the
// background, and swaps in the new data when it lands. Every background
// fetch goes through `trackSync`, which drives the "Syncing" bar.
//
// Entries are namespaced by the signed-in Clerk user, so a shared browser
// never shows one member's data to another.
import * as React from "react";
import { useAuth } from "@clerk/nextjs";

import { useLive, type Topic } from "./useLive";

const PREFIX = "ttc:v1:";
const MAX_AGE_MS = 7 * 86_400_000;
const memory = new Map<string, { at: number; data: unknown }>();

export function readCache<T>(key: string | null): T | undefined {
  if (!key) return undefined;
  const hit = memory.get(key);
  if (hit) return hit.data as T;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - parsed.at > MAX_AGE_MS) return undefined;
    memory.set(key, parsed);
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string | null, data: unknown) {
  if (!key) return;
  const entry = { at: Date.now(), data };
  memory.set(key, entry);
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Full or blocked storage: memory still has it for this visit.
  }
}

/// The cache key for this user and URL, or null until Clerk knows who it is.
export function useCacheKey(url: string | null): string | null {
  const { userId } = useAuth();
  return url && userId ? `${userId}:${url}` : null;
}

// ------------------------------------------------------------------ sync bar

let inflight = 0;
const syncListeners = new Set<(n: number) => void>();
const emit = () => syncListeners.forEach((fn) => fn(inflight));

export async function trackSync<T>(work: Promise<T>): Promise<T> {
  inflight++;
  emit();
  try {
    return await work;
  } finally {
    inflight--;
    emit();
  }
}

/// True while any background fetch has been running for over 250ms, so a
/// quick refresh never flashes the bar.
export function useSyncing(): boolean {
  const [count, setCount] = React.useState(inflight);
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    syncListeners.add(setCount);
    return () => {
      syncListeners.delete(setCount);
    };
  }, []);
  React.useEffect(() => {
    if (!count) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), 250);
    return () => window.clearTimeout(timer);
  }, [count]);
  return show;
}

// ------------------------------------------------------------------ hook

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `Request failed (${res.status})`), { status: res.status });
  return json as T;
}

/// Runs `fn` when the tab comes back into view, the way a native app
/// refreshes when reopened.
export function useOnFocus(fn: () => void) {
  const latest = React.useRef(fn);
  latest.current = fn;
  React.useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && latest.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}

export const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export function useCachedJson<T>(url: string | null, opts: { topic?: Topic } = {}) {
  const key = useCacheKey(url);
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  // Before paint: show the cached copy for this URL (or nothing).
  useIsoLayoutEffect(() => {
    setData(readCache<T>(key));
    setError(null);
  }, [key]);

  const refresh = React.useCallback(async () => {
    if (!url || !key) return;
    try {
      const next = await trackSync(fetchJson<T>(url));
      writeCache(key, next);
      setData(next);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load");
    }
  }, [url, key]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  useLive(opts.topic ?? null, () => void refresh());
  useOnFocus(() => void refresh());

  const mutate = React.useCallback(
    (next: T) => {
      writeCache(key, next);
      setData(next);
    },
    [key]
  );

  return { data, error, refresh, mutate };
}
