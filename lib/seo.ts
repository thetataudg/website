// lib/seo.ts
//
// Builds a complete Metadata object for a public page.
//
// This exists because Next merges metadata *shallowly*: a route that declares
// its own `openGraph` replaces the parent layout's entirely rather than adding
// to it. Setting just `openGraph: { url }` on a route therefore silently drops
// og:image, og:site_name, og:locale, and og:type for that page. Rather than
// repeat the full object in a dozen layouts and watch them drift, every public
// route builds its metadata here.

import type { Metadata } from "next";
import { absoluteUrl } from "./siteUrl";

const SITE_NAME = "ASU Theta Tau - Delta Gamma Chapter";
const DEFAULT_OG_IMAGE = "/og-default.jpg";
const DEFAULT_OG_ALT =
  "Members of the Theta Tau Delta Gamma chapter at Arizona State University";

type PageSeo = {
  /// Page title, without the site suffix. The root layout's template appends it.
  title: string;
  description: string;
  /// Site-relative path, e.g. "/rush". Used for both canonical and og:url.
  path: string;
  /// Overrides the default share image when a page has a better one.
  image?: { url: string; width: number; height: number; alt: string };
  /// Set for pages that should stay out of search results.
  noindex?: boolean;
  /// Set on a layout that has child routes beneath it.
  ///
  /// Next applies only the *nearest* ancestor title template. A segment that
  /// sets a plain-string title therefore stops the root layout's "%s | ..."
  /// suffix from ever reaching its children: /brothers/family-tree rendered as
  /// a bare "Family Tree" because /brothers sat in between. Re-declaring the
  /// template here keeps it flowing downward.
  hasChildRoutes?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  image,
  noindex,
  hasChildRoutes,
}: PageSeo): Metadata {
  const og = image ?? {
    url: DEFAULT_OG_IMAGE,
    width: 1200,
    height: 630,
    alt: DEFAULT_OG_ALT,
  };

  // Absolute on purpose. A relative og:image is resolved against metadataBase,
  // which held in production but came out as the dev origin here, and most link
  // unfurlers refuse a relative image outright. absoluteUrl() is the same
  // resolver behind the canonical, so the two can never disagree.
  const imageUrl = og.url.startsWith("http") ? og.url : absoluteUrl(og.url);

  return {
    title: hasChildRoutes
      ? { default: title, template: `%s | ${SITE_NAME}` }
      : title,
    description,
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [{ ...og, url: imageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [imageUrl],
    },
  };
}
