// lib/mcp/oauth.ts
// The OAuth vocabulary of the MCP endpoint: what the protected resource is
// called, who issues tokens for it, and where a client is told to look.
//
// The site is the MCP resource server and Clerk is the authorization server
// (Configure > Agents > MCP servers in the Clerk dashboard, with dynamic client
// registration on). A client hits `/api/mcp`, gets a 401 whose
// `WWW-Authenticate` points at the protected-resource metadata below (RFC 9728
// and the MCP authorization spec), reads Clerk's issuer from it, registers
// itself with Clerk and sends the member through Clerk's own sign-in. What
// comes back is a Clerk OAuth access token, verified in `lib/mcp/auth.ts`.
import { siteUrl } from "@/lib/siteUrl";

/// `https://ttdg.org/api/mcp`: the canonical resource identifier. It is what
/// the Clerk dashboard entry was created with and what the metadata's
/// `resource` must equal, so it comes from the same origin resolver as every
/// other absolute URL on the site.
export function mcpResourceUrl(): string {
  return `${siteUrl()}/api/mcp`;
}

/// RFC 9728 puts a resource's metadata at `/.well-known/oauth-protected-resource`
/// with the resource's own path appended.
export function protectedResourceMetadataUrl(): string {
  return `${siteUrl()}/.well-known/oauth-protected-resource/api/mcp`;
}

/// Clerk's Frontend API origin, e.g. `https://clerk.ttdg.org`, which is also
/// the OAuth issuer.
///
/// The publishable key is `pk_live_` or `pk_test_` followed by the base64 of
/// the host and a trailing `$`. Decoded here instead of importing
/// `@clerk/shared` because the whole job is four lines and the package is not
/// a direct dependency.
export function clerkFrontendApiUrl(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const encoded = key.replace(/^pk_(live|test)_/, "");
  if (!encoded || encoded === key) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key");
  }
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$+$/, "");
  return `https://${host}`;
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [clerkFrontendApiUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "Theta Tau Delta Gamma chapter tools",
  };
}

/// Bearer tokens, not cookies, authenticate this endpoint, so no browser ever
/// attaches ambient credentials to a cross-origin call and `*` is safe. It lets
/// browser-based clients (the MCP Inspector, web connectors) read the metadata
/// and call the endpoint at all.
export const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};
