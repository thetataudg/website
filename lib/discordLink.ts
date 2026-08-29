// lib/discordLink.ts
// The one fact the Discord link routes have to agree on.
//
// Both the route that mints the OAuth state and the callback that consumes it
// decide where the browser is allowed to land afterwards. That value is
// round-tripped through Discord and echoed into a redirect, so if the two
// disagree the app's callback silently becomes /member and the authentication
// session in the app never closes. A shared constant rather than a literal in
// each file, and a fixed string rather than a pattern, because "any URL that
// looks like our app" is how open redirects get written.
export const APP_LINK_CALLBACK = "org.thetatau.dg.ThetaTau://discord-linked";

/// Where the callback may send the browser: site-relative paths, plus the iOS
/// app's own scheme. Anything else collapses to the member home.
export function normalizeDiscordRedirect(value: string | null | undefined) {
  if (!value) return "/member";
  if (value === APP_LINK_CALLBACK) return value;
  if (value.startsWith("/")) return value;
  return "/member";
}
