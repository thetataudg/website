// lib/mcp/wellKnown.ts
// The two public metadata documents an MCP client reads before it has a token.
// Both routes under `app/.well-known/` are thin wrappers around these so the
// two protected-resource URLs (`.../oauth-protected-resource` and the
// path-suffixed `.../oauth-protected-resource/api/mcp`) cannot differ.
import {
  MCP_CORS_HEADERS,
  clerkFrontendApiUrl,
  protectedResourceMetadata,
} from "@/lib/mcp/oauth";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  // Short, so a change in the Clerk dashboard or the origin is picked up soon.
  "Cache-Control": "public, max-age=300",
  ...MCP_CORS_HEADERS,
};

export function protectedResourceResponse() {
  try {
    return new Response(JSON.stringify(protectedResourceMetadata()), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

/// Clerk's authorization-server metadata, passed through. Spec-following
/// clients follow `authorization_servers` to Clerk directly; this is for the
/// ones that look for `/.well-known/oauth-authorization-server` on the
/// resource's own origin first (older MCP clients did).
export async function authorizationServerResponse() {
  try {
    const upstream = await fetch(
      `${clerkFrontendApiUrl()}/.well-known/oauth-authorization-server`,
      { next: { revalidate: 300 } }
    );
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
        status: 502,
        headers: JSON_HEADERS,
      });
    }
    return new Response(await upstream.text(), { status: 200, headers: JSON_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 502,
      headers: JSON_HEADERS,
    });
  }
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}
