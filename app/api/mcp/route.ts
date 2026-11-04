// POST /api/mcp: the chapter's remote MCP server (Streamable HTTP).
//
// Stateless JSON-RPC over POST. There is no server-initiated traffic to
// stream, so GET (the optional SSE channel) and DELETE (session teardown) are
// answered 405, which the spec allows and clients treat as "no stream".
//
// Auth is Clerk OAuth: see `lib/mcp/auth.ts` for the verification and
// `lib/mcp/oauth.ts` for how a client discovers where to sign in. The endpoint
// is public to the middleware (it only authenticates, never protects), so the
// 401 with its `WWW-Authenticate` pointer is produced here.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { MCP_CORS_HEADERS } from "@/lib/mcp/oauth";
import { createMcpServer } from "@/lib/mcp/server";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withCors(response: Response) {
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }
  return response;
}

export async function POST(req: Request) {
  // Authenticated before the body is read, so an unauthenticated caller costs
  // a header check and not a JSON parse.
  const authResult = await authenticateMcpRequest();
  if (!authResult.ok) return authResult.response;

  const server = createMcpServer({ member: authResult.member });
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session id is issued or expected.
    sessionIdGenerator: undefined,
    // One JSON body per POST rather than an SSE stream; every tool here
    // returns in one piece.
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return withCors(response);
  } catch (err) {
    logger.error({ err }, "MCP request failed");
    return withCors(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    );
  } finally {
    // The response body is already built in JSON mode, so closing here
    // cannot truncate it.
    void server.close().catch(() => undefined);
  }
}

function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. POST JSON-RPC to this endpoint." },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...MCP_CORS_HEADERS },
    }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}
