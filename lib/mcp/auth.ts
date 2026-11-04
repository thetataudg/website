// lib/mcp/auth.ts
// Turning a Bearer OAuth access token into a chapter member, or a refusal.
//
// Verification is Clerk's. `clerkMiddleware` (middleware.ts) already runs
// `authenticateRequest` with `acceptsToken: "any"` on every request, so by the
// time a route handler runs the token has been checked (signature and expiry
// for the JWT form; Clerk's API for an opaque `oat_` token). `auth()` with
// `acceptsToken: "oauth_token"` reads that verdict and hands back an
// `AuthenticatedMachineObject<"oauth_token">`: `userId`, `clientId`, `scopes`.
// Nothing here parses or trusts a token itself.
//
// Because the session-token default is untouched everywhere else, the same
// Bearer token is a signed-out request to every other API route: an OAuth
// grant given to an agent opens `/api/mcp` and nothing more. And the other
// way round, a browser session cookie or a session JWT is not accepted here.
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { MCP_CORS_HEADERS, protectedResourceMetadataUrl } from "@/lib/mcp/oauth";

export type McpAuthResult =
  | { ok: true; member: any; clerkId: string; clientId: string | null }
  | { ok: false; response: Response };

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...MCP_CORS_HEADERS, ...extra },
  });
}

/// 401 with the pointer a client needs to start the OAuth flow.
export function unauthorized(description = "Authentication required") {
  return json(
    401,
    { error: "unauthorized", error_description: description },
    {
      "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`,
    }
  );
}

/// Members who may not use the chapter's tools: removed or deceased. Alumni
/// can sign in to the site (they see the events flagged for them), so they can
/// connect here too, with the same narrower view.
const BLOCKED_STATUSES = new Set(["Removed", "Deceased"]);

export async function authenticateMcpRequest(): Promise<McpAuthResult> {
  // The shipped typings of `auth()` only model the session-token overload
  // here (`acceptsToken` is accepted at runtime and typed in @clerk/backend's
  // `GetAuthFn`, but not through Next's `AuthFn` alias), so the OAuth shape is
  // spelled out. It matches `AuthenticatedMachineObject<"oauth_token">`.
  type OAuthAuth = {
    isAuthenticated: boolean;
    tokenType: string | null;
    userId?: string | null;
    clientId?: string | null;
    scopes?: string[] | null;
  };
  let authObject: OAuthAuth;
  try {
    authObject = (await (auth as unknown as (o: {
      acceptsToken: "oauth_token";
    }) => Promise<OAuthAuth>)({ acceptsToken: "oauth_token" }));
  } catch {
    // `auth()` throws when the middleware did not run for this request, which
    // is a deployment problem, but the client's only sensible reading is
    // "not authenticated".
    return { ok: false, response: unauthorized() };
  }

  if (
    !authObject.isAuthenticated ||
    authObject.tokenType !== "oauth_token" ||
    !authObject.userId
  ) {
    return { ok: false, response: unauthorized("Invalid or missing access token") };
  }

  await connectDB();
  const member = await Member.findOne({ clerkId: authObject.userId }).lean<any>();
  if (!member || Array.isArray(member)) {
    return {
      ok: false,
      response: json(403, {
        error: "forbidden",
        error_description: "This account is not linked to a chapter member.",
      }),
    };
  }
  if (BLOCKED_STATUSES.has(member.status)) {
    return {
      ok: false,
      response: json(403, {
        error: "forbidden",
        error_description: "This member is not active.",
      }),
    };
  }

  return {
    ok: true,
    member,
    clerkId: authObject.userId,
    clientId: authObject.clientId ?? null,
  };
}
