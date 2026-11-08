// lib/mcp/server.ts
// One MCP server per request, bound to the member who made it.
//
// Stateless on purpose: the endpoint runs in a single Docker container that
// can be replaced under a connected client at any deploy, and an MCP session
// held in memory would die with it. Building the server per request costs a
// handful of function calls, and it means the tool closures hold the
// authenticated member directly, so no tool can act as anybody else.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "@/lib/mcp/tool";
import { registerAnnouncementTools } from "@/lib/mcp/tools/announcements";
import { registerAttendanceTools } from "@/lib/mcp/tools/attendance";
import { registerDirectoryTools } from "@/lib/mcp/tools/directory";
import { registerDuesTools } from "@/lib/mcp/tools/dues";
import { registerEventTools } from "@/lib/mcp/tools/events";
import { registerTaskTools } from "@/lib/mcp/tools/tasks";

const INSTRUCTIONS = `Tools for the Theta Tau Delta Gamma chapter website (ttdg.org). You act as the signed-in member, with exactly the permissions that member has on the website: a tool refuses when their role does not allow it, and says why. Start with whoami to see what you can do. Times are Arizona time. Ids from list tools can be passed to the other tools; most tools also accept a committee name, a roll number or a member's full name. Do not use em dashes in anything written for members. Announcements reach real people: always show the user the message and audience and get a clear yes before sending with confirm: true.`;

export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "ttdg-chapter", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );
  registerDirectoryTools(server, ctx);
  registerEventTools(server, ctx);
  registerAttendanceTools(server, ctx);
  registerDuesTools(server, ctx);
  registerAnnouncementTools(server, ctx);
  registerTaskTools(server, ctx);
  return server;
}
