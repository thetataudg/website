// lib/sentryOptions.ts
// What every Sentry runtime (browser, Node, edge) shares.
//
// Error tracking only, on Sentry's free Developer plan: 5,000 errors a month.
// No performance tracing and no session replay, which spend a separate quota
// and aren't what this is for.

/// The "website" project in the theta-tau-delta-gamma org. A DSN can only
/// submit events, never read them, so like the Clerk publishable key it is
/// safe in the bundle. NEXT_PUBLIC_SENTRY_DSN overrides it.
export const WEBSITE_SENTRY_DSN =
  "https://3b440e9694c085bc341f917bbda3f153@o4512307902611456.ingest.us.sentry.io/4512308121239552";

export function sentryBaseOptions(dsn: string | undefined) {
  return {
    dsn: dsn || WEBSITE_SENTRY_DSN,
    // Production builds only, so `npm run dev` doesn't spend the quota.
    enabled: process.env.NODE_ENV === "production",
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.CONTEXT || // Netlify: production, deploy-preview, branch-deploy
      process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Member emails and IP addresses stay out of Sentry. The Clerk user id is
    // attached on purpose (see `requireAuth`), which is enough to look someone
    // up without copying their details to a third party.
    sendDefaultPii: false,
  };
}
