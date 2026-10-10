import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MAX_PROGRESS_TEXT, SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './constants.js';
import { getBlastRadius } from './tools/get-blast-radius.js';
import { getConventions } from './tools/get-conventions.js';
import { getFindings } from './tools/get-findings.js';
import { listAgents } from './tools/list-agents.js';
import { runAgentOnPr } from './tools/run-agent-on-pr.js';
import { executeTool, sanitizeText, type ToolContext, type ToolDef, type ToolDeps } from './tool.js';

/** In call order. */
export const TOOLS: readonly ToolDef[] = [
  listAgents as unknown as ToolDef,
  runAgentOnPr as unknown as ToolDef,
  getFindings as unknown as ToolDef,
  getConventions as unknown as ToolDef,
  getBlastRadius as unknown as ToolDef,
];

export function createMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  for (const def of TOOLS) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        // A strict object, not the bare shape: an empty shape lists without `additionalProperties: false`.
        inputSchema: z.object(def.inputShape).strict(),
        annotations: def.annotations,
      },
      async (args, extra): Promise<CallToolResult> => {
        const progressToken = extra._meta?.progressToken;
        let counter = 0;
        const ctx: ToolContext = {
          signal: extra.signal,
          progress:
            progressToken === undefined
              ? undefined
              : (message) => {
                  counter += 1;
                  extra
                    .sendNotification({
                      method: 'notifications/progress',
                      // The text is a run event's: model-written, so it is masked and capped like every API string.
                      params: { progressToken, progress: counter, message: sanitizeText(message, MAX_PROGRESS_TEXT) },
                    })
                    .catch(() => {});
                },
        };
        return executeTool(def, args, deps, ctx);
      },
    );
  }

  return server;
}
