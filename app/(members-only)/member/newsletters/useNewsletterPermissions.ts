"use client";

import { useEffect, useState } from "react";

export interface NewsletterViewer {
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
  loaded: boolean;
}

/// Mirrors `canEditNewsletters` on the server exactly.
///
/// The client's copy decides whether to *draw* a control; the API decides
/// whether to honour it. They are kept identical so a member is never offered
/// a button whose every use would 403 — and never denied one the server would
/// have allowed.
export function canEdit(viewer: NewsletterViewer | null): boolean {
  if (!viewer) return false;
  return (
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    Boolean(viewer.isECouncil)
  );
}

export function useNewsletterPermissions(): NewsletterViewer {
  const [viewer, setViewer] = useState<NewsletterViewer>({ loaded: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error("no profile");
        const data = await res.json();
        if (cancelled) return;
        setViewer({
          role: data.role,
          isECouncil: data.isECouncil,
          ecouncilPosition: data.ecouncilPosition,
          loaded: true,
        });
      } catch {
        // A failed lookup means "not an editor", never "an editor". Guessing
        // upward here would draw a builder the API refuses to save.
        if (!cancelled) setViewer({ loaded: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return viewer;
}
