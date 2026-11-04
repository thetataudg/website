// Clerk's OAuth authorization-server metadata, proxied for MCP clients that
// look for it on the resource's own origin. See `lib/mcp/wellKnown.ts`.
import { authorizationServerResponse, corsPreflight } from "@/lib/mcp/wellKnown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return authorizationServerResponse();
}

export function OPTIONS() {
  return corsPreflight();
}
