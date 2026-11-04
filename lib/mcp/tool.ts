// lib/mcp/tool.ts
// The few things every MCP tool shares: the authenticated member it acts as,
// a result shape, and the one place errors are turned into text.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import logger from "@/lib/logger";

/// Who a tool call acts as. `member` is the lean Member behind the OAuth
/// token; every permission check is made against it, never against anything a
/// caller passes in.
export interface McpContext {
  member: any;
}

/// A refusal or a mistake the caller can fix, as opposed to a crash. Its
/// message is shown to the model verbatim, so it says what to do next.
export class ToolError extends Error {}

export type ToolOutput = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/// Compact JSON. Models read it directly, and indentation is tokens.
export function ok(data: unknown): ToolOutput {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function fail(message: string): ToolOutput {
  return { content: [{ type: "text", text: message }], isError: true };
}

/// Same classification as `apiErrorResponse`: a 4xx `statusCode` carries a
/// message meant for people, a bad id or invalid field is the caller's mistake,
/// and anything else is ours, so its detail stays in the logs.
function describeError(err: any): string {
  if (err instanceof ToolError) return err.message;
  const code = Number(err?.statusCode ?? err?.status);
  if (Number.isInteger(code) && code >= 400 && code < 500) {
    return String(err?.message || "Request failed");
  }
  if (err?.name === "CastError" || err?.name === "ValidationError") {
    return "Some of that information wasn't valid. Check ids and dates.";
  }
  logger.error({ err }, "MCP tool failed");
  return "Something went wrong on the server.";
}

export interface ToolDef<S extends ZodRawShape> {
  title: string;
  description: string;
  input: S;
  /// Hints for the client's confirmation UI. `readOnlyHint` tools never write;
  /// `destructiveHint` tools remove or cancel something that is not simply
  /// undone.
  annotations: ToolAnnotations;
  run: (args: any, ctx: McpContext) => Promise<unknown>;
}

export function defineTool<S extends ZodRawShape>(
  server: McpServer,
  ctx: McpContext,
  name: string,
  def: ToolDef<S>
) {
  server.registerTool(
    name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      annotations: { openWorldHint: false, ...def.annotations },
    },
    (async (args: unknown) => {
      try {
        const result = await def.run(args, ctx);
        return result && typeof result === "object" && "content" in (result as any)
          ? (result as ToolOutput)
          : ok(result);
      } catch (err) {
        return fail(describeError(err));
      }
    }) as any
  );
}

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};
export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};
export const WRITE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
};
