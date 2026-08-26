import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

// The site shipped without a robots.txt, so crawlers got a 404 here and had no
// pointer to the sitemap. Everything under Disallow is either an API surface, a
// signed-in area, or a page the chapter has decided to keep out of search.
//
// `/brother` covers both the submission form and the individual profile pages,
// which carry students' names, majors, grad years, and resume links. They stay
// reachable by link from /brothers; they just do not get indexed.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/member", "/brother", "/lockdown"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
