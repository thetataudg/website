// lib/mail/site.ts
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (configured || "https://ttdg.org").replace(/\/$/, "");
}
