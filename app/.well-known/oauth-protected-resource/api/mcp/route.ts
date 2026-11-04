// RFC 9728 protected-resource metadata for the MCP endpoint at /api/mcp.
// Served at both the bare and the path-suffixed well-known URL; see
// `lib/mcp/wellKnown.ts`.
import { corsPreflight, protectedResourceResponse } from "@/lib/mcp/wellKnown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return protectedResourceResponse();
}

export function OPTIONS() {
  return corsPreflight();
}
