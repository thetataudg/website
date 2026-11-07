"use client";

import { useEffect, useRef } from "react";

export type Topic = "mail" | "notification" | "tasks";

/// One EventSource per tab, however many components listen. The bell, the
/// navbar and the inbox all want the same stream, and three connections per
/// tab would triple what the server holds open.
const listeners = new Map<Topic, Set<() => void>>();
let source: EventSource | null = null;

function ensureSource() {
  if (source || typeof window === "undefined" || !("EventSource" in window)) return;
  source = new EventSource("/api/live");
  (["mail", "notification", "tasks"] as Topic[]).forEach((topic) => {
    source!.addEventListener(topic, () => listeners.get(topic)?.forEach((fn) => fn()));
  });
  // After a dropped connection nothing was delivered in between, so refetch
  // everything once it's back rather than trusting the gap was quiet.
  source.addEventListener("ready", () => {
    listeners.forEach((set) => set.forEach((fn) => fn()));
  });
}

function releaseSource() {
  const anyone = Array.from(listeners.values()).some((set) => set.size > 0);
  if (!anyone && source) {
    source.close();
    source = null;
  }
}

/// Calls `onChange` whenever the server says `topic` changed for this member.
export function useLive(topic: Topic | null, onChange: () => void) {
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!topic) return;
    const fn = () => latest.current();
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(fn);
    ensureSource();
    return () => {
      listeners.get(topic)?.delete(fn);
      releaseSource();
    };
  }, [topic]);
}
