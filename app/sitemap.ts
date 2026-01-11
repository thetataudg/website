import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const routes = [
    "",
    "/about",
    "/brothers",
    "/brother",
    "/members",
    "/pillars",
    "/rush",
    "/dei",
    "/anti-hazing",
    "/regionals",
    "/privacy-policy",
  ];

  return routes.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
