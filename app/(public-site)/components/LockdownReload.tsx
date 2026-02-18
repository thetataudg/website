"use client";

import { useEffect } from "react";

const RELOAD_PARAM = "lockdownReload";

export default function LockdownReload() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RELOAD_PARAM)) return;
    params.delete(RELOAD_PARAM);
    const base = window.location.pathname + (params.toString() ? `?${params.toString()}` : "") + window.location.hash;
    window.history.replaceState({}, document.title, base);
    window.location.reload();
  }, []);

  return null;
}
