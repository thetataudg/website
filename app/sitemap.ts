import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

// Only pages that are public, indexable, and real belong here. Submitting a URL
// that 404s or that robots.txt disallows is a Search Console error, not a
// ranking signal, so this list is kept in step with app/robots.ts.
//
// Deliberately absent:
//   /brother, /brother/[rollNo]  individual profiles, kept out of the index
//   /member                      signed-in chapter tools
//   /lockdown                    operational page, not content
const routes: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/rush", priority: 0.9, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/brothers", priority: 0.8, changeFrequency: "weekly" },
  { path: "/mobile", priority: 0.7, changeFrequency: "monthly" },
  { path: "/pillars", priority: 0.6, changeFrequency: "yearly" },
  { path: "/donate", priority: 0.6, changeFrequency: "monthly" },
  { path: "/regionals", priority: 0.6, changeFrequency: "monthly" },
  { path: "/brothers/family-tree", priority: 0.5, changeFrequency: "monthly" },
  { path: "/dei", priority: 0.4, changeFrequency: "yearly" },
  { path: "/anti-hazing", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
