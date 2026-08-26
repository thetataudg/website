// lib/siteUrl.ts
//
// One place that answers "what is this site's canonical origin?".
//
// Before this existed, four files each guessed on their own: the public layout
// preferred NEXT_PUBLIC_SITE_URL, the sitemap did the same but re-implemented
// it, the notification emails hardcoded https://thetatau-dg.org, and the
// brother-profile metadata reached for a NEXT_PUBLIC_BASE_URL that is set
// nowhere and fell back to https://thetatauasu.org — a domain two moves ago.
// Canonical tags, sitemap entries, and Open Graph URLs all have to agree or
// Google treats them as competing copies of the same page, so they now share
// this resolver.
//
// Production sets NEXT_PUBLIC_SITE_URL=https://ttdg.org (see prod.env.inject).

const FALLBACK_ORIGIN = "https://ttdg.org";

/// The canonical origin, with any trailing slash removed.
export function siteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;

  // A localhost value is right for `next dev` and wrong for anything that ends
  // up in a crawler's hands, but the build has no way to tell the two apart, so
  // it is honoured as configured and only the empty case falls back.
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }

  return FALLBACK_ORIGIN;
}

/// An absolute URL for a site-relative path: `absoluteUrl("/rush")`.
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${suffix === "/" ? "" : suffix}`;
}
